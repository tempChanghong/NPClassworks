import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';
import {seatingImageDimensions} from '../src/utils/seatingImage.js';
let h;
before(async()=>{h=await createFlowHarness();});after(async()=>{await h?.close();});beforeEach(()=>{h.reset();h.api.saveAccountTokens({accessToken:'access',refreshToken:'session'});});
const envelope=(id,data)=>({protocolVersion:'0.14',requestId:id,serverTime:new Date().toISOString(),data});
function setup() {
  h.routes.set('GET /api/v2/npep/schools/school/seating/catalog',(req,reply)=>reply(envelope(req.headers['x-request-id'],{termId:'term',classes:[{id:'one',name:'一班'},{id:'two',name:'二班'}]}),200,true));
  h.routes.set('GET /api/v2/npep/schools/school/seating',(req,reply)=>reply(envelope(req.headers['x-request-id'],{current:{revision:0,hash:null},versions:[],receipts:[]}),200,true));
}
test('NPEP is a peer group and permissions are deferred; legacy section remains mapped',async()=>{
  const {state}=await h.openAdminAccounts();
  const groups=state.adminNavigationGroups;assert.deepEqual(groups.map(g=>g.label),['日常管理','NPEP','学校配置','运维与安全']);
  assert.deepEqual(groups.find(g=>g.label==='NPEP').items.map(i=>i.title),['大屏互联','自习展示','噪音监测','自习座位表']);
  assert.equal(state.normalizeAdminSection('npep'),'npep-devices');
  assert.ok(!groups.flatMap(g=>g.items).some(i=>i.title==='权限管理'));
});
test('seating requests retain current class and same request identity across uncertain retries',async()=>{
  setup();let calls=[];h.routes.set('POST /api/v2/npep/schools/school/seating',(req,reply)=>{
    calls.push(req);assert.equal(req.headers['x-npep-version'],'0.14');assert.equal(req.headers['x-request-id'],req.body.requestId);
    if(calls.length===1)return reply({error:{code:'TEMPORARILY_UNAVAILABLE'}},503);
    reply(envelope(req.body.requestId,{revision:1,hash:'a'.repeat(64)}),200,true);
  });
  const {state:s,events}=await h.openComponent('/src/components/admin/NpepSeatingSettings.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2));await s.changeClass('one');
  s.draft.value={image:'fixture',dataUrl:'data:image/png;base64,fixture',width:1,height:1,byteCount:8};
  await s.publish('image');assert.ok(s.draft.value);await s.publish('image');assert.equal(calls.length,2);assert.deepEqual(calls[0].body,calls[1].body);
  assert.equal(calls[0].body.classId,'one');assert.equal(s.draft.value,null);assert.ok(events.some(e=>e[0]==='dirty'&&e[1]===true));
});
test('a late class response cannot overwrite the newly selected class',async()=>{
  setup();const held=deferred();h.routes.set('GET /api/v2/npep/schools/school/seating',async(req,reply)=>{
    const old=req.query.get('classId')==='one';if(old)await held.promise;
    reply(envelope(req.headers['x-request-id'],{current:{revision:old?99:2,hash:null},versions:[],receipts:[]}),200,true);
  });
  const {state:s}=await h.openComponent('/src/components/admin/NpepSeatingSettings.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2));const first=s.changeClass('one');
  await eventually(()=>assert.ok(h.requests.some(r=>r.query.get('classId')==='one')));await s.changeClass('two');held.resolve();await first;
  assert.equal(s.classId.value,'two');assert.equal(s.current.value.revision,2);
});

test('an old image cannot overwrite a freshly reloaded class after A to B to A',async()=>{
  setup(); const held=deferred(), base='/api/v2/npep/schools/school/seating'; let reads=0;
  h.routes.set(`GET ${base}`,(req,reply)=>{
    const revision=req.query.get('classId')==='one' ? ++reads : 7;
    reply(envelope(req.headers['x-request-id'],{current:{revision,hash:`image-${revision}`},versions:[],receipts:[]}),200,true);
  });
  h.routes.set(`GET ${base}/image`,async(req,reply)=>{
    const revision=req.query.get('revision');
    if(req.query.get('classId')==='one' && revision==='1')await held.promise;
    reply(envelope(req.headers['x-request-id'],{image:`fixture-${revision}`}),200,true);
  });
  const {state:s}=await h.openComponent('/src/components/admin/NpepSeatingSettings.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2)); const old=s.changeClass('one');
  await eventually(()=>assert.ok(h.requests.some(r=>r.path===`${base}/image` && r.query.get('revision')==='1')));
  await s.changeClass('two'); await s.changeClass('one'); held.resolve(); await old;
  assert.equal(s.classId.value,'one'); assert.equal(s.ready.value,true);
  assert.equal(s.current.value.revision,2); assert.equal(s.preview.value,'data:image/png;base64,fixture-2');
});
test('seat results from a changed account session are cancelled',async()=>{
  const held=deferred();h.routes.set('GET /api/v2/npep/schools/school/seating',async(req,reply)=>{await held.promise;reply(envelope(req.headers['x-request-id'],{current:{revision:99}}),200,true);});
  const request=h.api.npepSeatingApi.list('school',{termId:'term',classId:'one'}).catch(e=>e);
  await eventually(()=>assert.ok(h.requests.some(r=>r.path.endsWith('/seating'))));h.api.saveAccountTokens({accessToken:'other',refreshToken:'other-session'});held.resolve();assert.equal((await request).code,'ERR_CANCELED');
});
test('image headers bound decoded pixels before browser decoding',()=>{
  const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10]);const view=new DataView(b.buffer);view.setUint32(16,2000);view.setUint32(20,3000);
  assert.deepEqual(seatingImageDimensions(b),{width:2000,height:3000});view.setUint32(16,4097);assert.throws(()=>seatingImageDimensions(b));
  assert.throws(()=>seatingImageDimensions(new Uint8Array(20)));
});
for (const failure of ['list', 'image']) test(`failed ${failure} for another class clears observations and blocks all writes`,async()=>{
  setup(); const base='/api/v2/npep/schools/school/seating';
  h.routes.set(`GET ${base}`,(req,reply)=>{
    if(req.query.get('classId')==='two' && failure==='list') return reply({error:{code:'TEMPORARILY_UNAVAILABLE'}},503);
    reply(envelope(req.headers['x-request-id'],{current:{revision:7,hash:'image-'+req.query.get('classId')},versions:[{revision:6,restorable:true}],receipts:[{deviceId:'fixture'}]}),200,true);
  });
  h.routes.set(`GET ${base}/image`,(req,reply)=>{
    if(req.query.get('classId')==='two' && failure==='image') return reply({error:{code:'TEMPORARILY_UNAVAILABLE'}},503);
    reply(envelope(req.headers['x-request-id'],{image:'one-image'}),200,true);
  });
  const {state:s}=await h.openComponent('/src/components/admin/NpepSeatingSettings.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2)); await s.changeClass('one');
  assert.equal(s.ready.value,true); assert.ok(s.preview.value);
  await s.changeClass('two');
  assert.equal(s.ready.value,false); assert.equal(s.current.value.hash,null); assert.equal(s.preview.value,null);
  assert.deepEqual(s.versions.value,[]); assert.deepEqual(s.receipts.value,[]); assert.ok(s.error.value);
  s.draft.value={image:'new'};
  await s.publish('image'); await s.withdraw(); await s.restore(6);
  assert.equal(h.requests.filter(r=>r.method==='POST' && r.path===base).length,0);
});
for (const action of ['withdraw','restore']) test(`changing class while confirming ${action} cannot write to the new class`,async()=>{
  setup(); const base='/api/v2/npep/schools/school/seating';
  h.routes.set(`GET ${base}`,(req,reply)=>reply(envelope(req.headers['x-request-id'],{current:{revision:7,hash:'fixture'},versions:[{revision:6,restorable:true}],receipts:[]}),200,true));
  h.routes.set(`GET ${base}/image`,(req,reply)=>reply(envelope(req.headers['x-request-id'],{image:'fixture'}),200,true));
  const {state:s}=await h.openComponent('/src/components/admin/NpepSeatingSettings.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2)); await s.changeClass('one');
  const confirming=action==='withdraw' ? s.withdraw() : s.restore(6);
  await s.changeClass('two'); h.dialogs.settleActionDialog(true); await confirming;
  assert.equal(s.ready.value,true); assert.equal(s.classId.value,'two');
  assert.equal(h.requests.filter(r=>r.method==='POST' && r.path===base).length,0);
});
