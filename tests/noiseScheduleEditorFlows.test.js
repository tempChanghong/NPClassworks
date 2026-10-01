import {before, beforeEach, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';
let h;
before(async () => { h = await createFlowHarness(); });
beforeEach(() => { h.reset(); h.api.saveAccountTokens({accessToken:'access',refreshToken:'session'}); });
after(async () => { await h?.close(); });
const path = '/api/v2/npep/schools/school/noise-schedules';
const envelope = (req, data) => ({protocolVersion:'0.7',requestId:req.body?.requestId || req.headers['x-request-id'],serverTime:new Date().toISOString(),data});
function catalog() {
  return {termId:'term',terms:[{id:'term',name:'本学期'}],grades:[{id:'grade',name:'高二'}],classes:[{id:'class',name:'一班',gradeId:'grade',pairedDevices:1}],policies:[],executionEnabled:false};
}
function routeCatalog() { h.routes.set(`GET ${path}`,(req,reply) => {
  assert.equal(req.headers['x-npep-version'],'0.7'); assert.equal(req.query.get('termId'),'term'); reply(envelope(req,catalog()),200,true);
}); }
async function editor() { routeCatalog(); const result = await h.openNoiseScheduleEditor(); await eventually(()=>assert.equal(result.state.loaded.value,true)); return result; }

test('actual client loads scope, previews and saves with 0.7 and a stable retry ID',async()=>{
  const {state} = await editor(); state.draft.value = {mode:'Override',rules:[{days:[1],start:'19:00',end:'21:00'}]};
  h.routes.set(`POST ${path}/preview`,(req,reply)=>reply(envelope(req,{baseRevision:0,items:[],totalClasses:1,changedClasses:1,pairedDevices:1}),200,true));
  await state.previewDraft(); assert.equal(state.preview.value.totalClasses,1);
  const ids=[];
  h.routes.set(`POST ${path}`,(req,reply)=>{
    ids.push(req.body.requestId); assert.equal(req.headers['x-npep-version'],'0.7'); assert.equal(req.headers.authorization,'Bearer access');
    assert.equal(req.body.targetId,'grade'); assert.equal(req.body.expectedRevision,0);
    if(ids.length===1) return reply({error:{code:'TEMPORARILY_UNAVAILABLE'}},503);
    reply(envelope(req,{revision:1,updatedAt:new Date().toISOString(),items:[],baseRevision:0,executionEnabled:true}),200,true);
  });
  await state.save(); assert.match(state.error.value,/TEMPORARILY_UNAVAILABLE/);
  await state.save(); assert.equal(ids.length,2); assert.equal(ids[0],ids[1]);
  assert.equal(state.revision.value,1); assert.match(state.message.value,/等待支持排程的桌面确认/);
});
test('conflict keeps draft and blocks overwrite until explicit reload',async()=>{
  const {state} = await editor(); const draft={mode:'Override',rules:[{days:[2],start:'20:00',end:'21:00'}]}; state.draft.value=draft;
  h.routes.set(`POST ${path}`,(_req,reply)=>reply({error:{code:'SCHEDULE_VERSION_CONFLICT'}},409));
  await state.save(); assert.deepEqual(state.draft.value,draft); assert.equal(state.valid.value,false);
  assert.match(state.error.value,/草稿已保留/); await state.refresh(); assert.equal(state.valid.value,true); assert.equal(state.draft.value.mode,'Disabled');
});
test('late preview cannot become current after draft or school change',async()=>{
  const {state,school}=await editor(), held=deferred();
  h.routes.set(`POST ${path}/preview`,async(req,reply)=>{await held.promise;reply(envelope(req,{items:[{name:'old'}]}),200,true);});
  const pending=state.previewDraft(); await eventually(()=>assert.ok(h.requests.some(r=>r.path.endsWith('/preview'))));
  state.draft.value={mode:'Override',rules:[{days:[1],start:'20:00',end:'21:00'}]};
  held.resolve(); await pending; assert.equal(state.preview.value,null);
  const old=deferred(); h.routes.set(`GET ${path}`,async(req,reply)=>{await old.promise;reply(envelope(req,catalog()),200,true);});
  const refreshing=state.refresh(); await eventually(()=>assert.equal(state.busy.value,true));
  h.routes.set('GET /api/v2/npep/schools/other/noise-schedules',(req,reply)=>reply(envelope(req,{...catalog(),grades:[{id:'other-grade',name:'别校'}]}),200,true));
  school.value='other'; await eventually(()=>assert.equal(state.targetId.value,'other-grade'));
  old.resolve(); await refreshing; assert.equal(state.targetId.value,'other-grade');
});
