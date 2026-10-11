import {before,after,beforeEach,test} from 'node:test';
import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createFlowHarness,deferred,eventually} from './helpers/flowHarness.js';
let h;
before(async()=>{h=await createFlowHarness();});after(async()=>{await h?.close();});
beforeEach(()=>{h.reset();h.api.saveAccountTokens({accessToken:'access',refreshToken:'session'});});
const envelope=(req,data,version='0.15')=>({protocolVersion:version,requestId:req.headers['x-request-id'],serverTime:new Date().toISOString(),data});
function catalog() {
  h.routes.set('GET /api/v2/npep/schools/school/seating/catalog',(req,reply)=>reply(envelope(req,{termId:'term',classes:[{id:'one',name:'一班'},{id:'two',name:'二班'}]},'0.14'),200,true));
}
test('exit failure records are queried explicitly and never revive a previous class result',async()=>{
  catalog();const held=deferred(),id=randomUUID();
  h.routes.set('GET /api/v2/npep/schools/school/study-exit-events',async(req,reply)=>{
    if(req.query.get('classId')==='one')await held.promise;
    assert.equal(req.headers['x-npep-version'],'0.15');
    reply(envelope(req,{items:req.query.get('classId')==='one'?[{eventId:id,reason:'Timeout',photoState:'Unavailable'}]:[],cursor:null}),200,true);
  });
  const {state:s}=await h.openComponent('/src/components/admin/NpepStudyPhotos.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2));s.classId.value='one';
  assert.equal(h.requests.filter(r=>r.path.endsWith('study-exit-events')).length,0);
  const old=s.loadExits();await eventually(()=>assert.ok(h.requests.some(r=>r.path.endsWith('study-exit-events'))));
  s.classId.value='two';await s.loadExits();held.resolve();await old;
  assert.equal(s.exitItems.value.length,0);assert.equal(s.exitLoaded.value,true);assert.equal(s.classId.value,'two');
});
const photo=id=>({eventId:id,classId:'one',capturedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),reason:'Noise',unit:'Dbfs',level:-20,high:-30});
test('photo browsing is explicit and an old class response cannot reappear after switching',async()=>{
  catalog();const held=deferred(),id=randomUUID();
  h.routes.set('GET /api/v2/npep/schools/school/study-photos',async(req,reply)=>{
    const old=req.query.get('classId')==='one';if(old)await held.promise;
    assert.equal(req.headers['x-npep-version'],'0.15');reply(envelope(req,{items:old?[photo(id)]:[],cursor:null}),200,true);
  });
  const {state:s}=await h.openComponent('/src/components/admin/NpepStudyPhotos.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2));s.classId.value='one';
  assert.equal(h.requests.filter(r=>r.path.endsWith('study-photos')).length,0);
  const old=s.load();await eventually(()=>assert.ok(h.requests.some(r=>r.query.get('classId')==='one')));
  s.classId.value='two';await s.load();held.resolve();await old;
  assert.equal(s.items.value.length,0);assert.equal(s.classId.value,'two');
});
test('delete confirmation is scoped; changing class cancels an unsubmitted deletion',async()=>{
  catalog();const id=randomUUID();const {state:s}=await h.openComponent('/src/components/admin/NpepStudyPhotos.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2));s.classId.value='one';
  const action=s.remove(photo(id));await eventually(()=>assert.equal(h.dialogs.actionDialogState.open,true));
  s.classId.value='two';h.dialogs.settleActionDialog(true);await action;
  assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('photo bytes require JPEG MIME and size; current account is rechecked before exposing a blob',async()=>{
  const client=h.api.default,original=client.defaults.adapter;
  try {
    client.defaults.adapter=async config=>({config,status:200,statusText:'OK',headers:{'content-type':'image/jpeg'},data:Buffer.from([255,216,255,217])});
    const result=await h.api.npepStudyPhotosApi.image('school',randomUUID());assert.equal(result.type,'image/jpeg');assert.equal(result.size,4);
    client.defaults.adapter=async config=>({config,status:200,statusText:'OK',headers:{'content-type':'text/html'},data:Buffer.from('<html>')});
    await assert.rejects(h.api.npepStudyPhotosApi.image('school',randomUUID()),/响应不兼容/);
    const held=deferred();let began=false;
    client.defaults.adapter=async config=>{began=true;await held.promise;return {config,status:200,statusText:'OK',headers:{'content-type':'image/jpeg'},data:Buffer.from([255,216,255,217])};};
    const pending=h.api.npepStudyPhotosApi.image('school',randomUUID()).catch(e=>e);
    await eventually(()=>assert.ok(began));h.api.saveAccountTokens({accessToken:'other',refreshToken:'other-session'});
    held.resolve();assert.equal((await pending).code,'ERR_CANCELED');
  } finally { client.defaults.adapter=original; }
});
test('photo deletion carries one stable request ID in headers and JSON',async()=>{
  const id=randomUUID();
  h.routes.set('POST /api/v2/npep/schools/school/study-photos/'+id+'/delete',(req,reply)=>{
    assert.equal(req.headers['x-request-id'],req.body.requestId);assert.equal(req.headers['x-npep-version'],'0.15');
    reply(envelope(req,{eventId:id,state:'Deleted'}),200,true);
  });
  assert.equal((await h.api.npepStudyPhotosApi.remove('school',id)).data.state,'Deleted');
});
