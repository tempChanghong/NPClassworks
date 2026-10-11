import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {nextTick} from 'vue';
import {createFlowHarness,deferred,eventually} from './helpers/flowHarness.js';
let h;
before(async()=>{h=await createFlowHarness();});after(async()=>{await h?.close();});
beforeEach(()=>{h.reset();h.api.saveAccountTokens({accessToken:'access',refreshToken:'session'});});
const envelope=(req,data,version)=>({protocolVersion:version,requestId:req.headers['x-request-id'],serverTime:new Date().toISOString(),data});
function catalog(){
  h.routes.set('GET /api/v2/npep/schools/school/seating/catalog',(req,reply)=>reply(envelope(req,{termId:req.query.get('termId'),classes:[{id:'one',name:'一班'},{id:'two',name:'二班'}]},'0.14'),200,true));
}
test('changing term after selecting a class still loads the new catalogue',async()=>{
  catalog();const {state:s,props}=await h.openComponent('/src/components/admin/NpepStudyReports.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2));s.classId.value='one';
  await nextTick();
  props.termId='next';
  await eventually(()=>assert.equal(s.term.value,'next'));
  assert.equal(s.classes.value.length,2);assert.equal(s.classId.value,null);
});
test('old report detail cannot reappear after changing class, and reads use the report protocol',async()=>{
  catalog();const held=deferred();
  h.routes.set('GET /api/v2/npep/schools/school/study-sessions',async(req,reply)=>{
    assert.equal(req.headers['x-npep-version'],'0.17');
    if(req.query.get('groupId'))await held.promise;
    reply(envelope(req,{items:req.query.get('classId')==='one'?[{groupId:'group',fragmentCount:1}]:[],cursor:null},'0.17'),200,true);
  });
  const {state:s}=await h.openComponent('/src/components/admin/NpepStudyReports.vue',{schoolId:'school',termId:'term'});
  await eventually(()=>assert.equal(s.classes.value.length,2));s.classId.value='one';
  await nextTick();
  await s.load();assert.equal(s.items.value[0].fragmentCount,1);
  const old=s.detail(s.items.value[0]);await eventually(()=>assert(h.requests.some(r=>r.query.get('groupId'))));
  s.classId.value='two';held.resolve();await old;
  assert.equal(s.selected.value,null);await s.load();assert.equal(s.items.value.length,0);
});
