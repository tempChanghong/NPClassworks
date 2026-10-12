import {before, beforeEach, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';
import {defaultStudySettings} from '../src/utils/npepStudySettings.js';
let h;
before(async () => { h = await createFlowHarness(); });
beforeEach(() => { h.reset(); h.api.saveAccountTokens({accessToken:'access',refreshToken:'session'}); });
after(async () => { await h?.close(); });
const path = '/api/v2/npep/schools/school/study-settings';
const envelope = (req,data) => ({protocolVersion:'0.10',requestId:req.body?.requestId || req.headers['x-request-id'],serverTime:new Date().toISOString(),data});
const catalog = () => ({termId:'term',terms:[{id:'term',name:'本学期'}],grades:[{id:'grade',name:'高二'}],
  classes:[{id:'class',name:'一班',gradeId:'grade',pairedDevices:1}],settings:[]});
const policy = () => { const settings=defaultStudySettings(); settings.schedule.effectiveFrom='2026-10-12'; settings.schedule.rules[0].days=[1]; return {mode:'Override',settings}; };
const preview = () => ({previewFingerprint:'a'.repeat(64),items:[],totalClasses:1,changedClasses:1,pairedDevices:1});
async function editor(data=catalog()) {
  h.routes.set(`GET ${path}`,(req,reply) => {
    assert.equal(req.headers['x-npep-version'],'0.10'); assert.equal(req.query.get('termId'),'term');
    reply(envelope(req,data),200,true);
  });
  const result=await h.openStudySettingsEditor();
  await eventually(()=>assert.equal(result.state.loaded.value,true)); return result;
}
function routePreview() { h.routes.set(`POST ${path}/preview`,(req,reply)=>reply(envelope(req,preview()),200,true)); }

test('legacy single redline expands only in the draft and preserves custom school settings',async()=>{
  const legacy=policy();legacy.settings.photos.continuousSeconds=2;legacy.settings.noise={enabled:true,redLineDbfs:-37};
  legacy.settings.schedule.rules[0].start='19:10';legacy.settings.homework.rotationSeconds=75;
  const before=globalThis.structuredClone(legacy);
  const {state}=await editor({...catalog(),settings:[{targetType:'GRADE',targetId:'grade',revision:7,policy:legacy}]});
  assert.deepEqual(state.draft.value.settings.noise,{enabled:true,redLineDbfs:-37,mediumLineDbfs:null,disciplineCooldownSeconds:600,highContinuousSeconds:2});
  assert.equal(state.draft.value.settings.schedule.rules[0].start,'19:10');
  assert.equal(state.draft.value.settings.homework.rotationSeconds,75);
  assert.equal(state.hasUnsavedChanges.value,false);assert.deepEqual(legacy,before);
  state.draft.value.settings.noise.mediumLineDbfs=-30;assert.equal(state.valid.value,false);
  state.draft.value.settings.noise.mediumLineDbfs=-45;assert.equal(state.valid.value,true);
});

test('defaults remain disabled, custom settings survive loading and toggling, class inherits explicitly',async()=>{
  const custom=policy(); custom.settings.schedule.rules[0].start='19:10'; custom.settings.homework.rotationSeconds=75;
  const {state}=await editor({...catalog(),settings:[{targetType:'GRADE',targetId:'grade',revision:7,policy:custom}]});
  assert.equal(state.hasUnsavedChanges.value,false); assert.deepEqual(state.draft.value,custom);
  state.changeMode('Disabled'); state.changeMode('Override'); assert.deepEqual(state.draft.value,custom);
  assert.equal(state.hasUnsavedChanges.value,false);
  state.targetType.value='CLASS'; state.targetId.value='class';
  assert.deepEqual(state.draft.value,{mode:'Inherit',settings:null});
  state.changeMode('Override'); assert.deepEqual(state.draft.value.settings.schedule.rules,[{days:[],start:'19:15',end:'21:30'}]);
  assert.deepEqual(state.draft.value.settings.noise.estimated,{highDbA:65,mediumDbA:50});
  assert.equal(state.draft.value.settings.schedule.effectiveFrom,''); assert.equal(state.valid.value,false);
});

test('saved 19:00 and custom schedules survive loading and mode toggling',async()=>{
  for(const start of ['19:00','18:40']) {
    const saved=policy(); saved.settings.schedule.rules[0].start=start;
    const original=globalThis.structuredClone(saved);
    const {state,unmount}=await editor({...catalog(),settings:[{targetType:'GRADE',targetId:'grade',revision:7,policy:saved}]});
    assert.deepEqual(state.draft.value,original);
    state.changeMode('Disabled');state.changeMode('Override');assert.deepEqual(state.draft.value,original);
    assert.equal(state.hasUnsavedChanges.value,false);unmount();
  }
});

test('loading and toggling existing acoustic/digital policies preserve school custom thresholds',async()=>{
  for(const estimated of [{highDbA:72,mediumDbA:54},null,undefined]) {
    const custom=policy();
    if(estimated===undefined)delete custom.settings.noise.estimated;
    else custom.settings.noise.estimated=estimated;
    custom.settings.noise.redLineDbfs=-37;custom.settings.noise.mediumLineDbfs=-48;
    const original=globalThis.structuredClone(custom);
    const {state,unmount}=await editor({...catalog(),settings:[{targetType:'GRADE',targetId:'grade',revision:7,policy:custom}]});
    assert.deepEqual(state.draft.value,original);
    state.changeMode('Disabled');state.changeMode('Override');assert.deepEqual(state.draft.value,original);
    assert.equal(state.hasUnsavedChanges.value,false);unmount();
  }
});

test('actual 0.10 client requires preview and preserves request ID across an ambiguous save retry',async()=>{
  const {state}=await editor(); assert.equal(state.draft.value.mode,'Disabled');
  state.draft.value=policy(); await state.save(); assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
  routePreview(); await state.previewDraft(); const ids=[];
  h.routes.set(`POST ${path}`,(req,reply)=>{
    ids.push(req.body.requestId); assert.equal(req.headers['x-npep-version'],'0.10'); assert.equal(req.headers.authorization,'Bearer access');
    assert.equal(req.body.expectedPreviewFingerprint,'a'.repeat(64)); assert.equal(req.body.expectedRevision,0);
    assert.equal(req.body.policy.settings.photos.enabled,false); assert.equal('previewDate' in req.body,false);
    if(ids.length===1) return reply({error:{code:'TEMPORARILY_UNAVAILABLE'}},503);
    reply(envelope(req,{...preview(),revision:1}),200,true);
  });
  await state.save(); assert.equal(state.hasUnsavedChanges.value,true);
  await state.save(); assert.equal(ids.length,2); assert.equal(ids[0],ids[1]);
  assert.equal(state.revision.value,1); assert.equal(state.hasUnsavedChanges.value,false);
  assert.match(state.message.value,/核对捕获及上传状态/);
  assert.doesNotMatch(state.message.value,/尚待接入/);
});

test('changed scope requires new preview, while revision conflict retains and blocks the draft',async()=>{
  const {state}=await editor(); state.draft.value=policy(); routePreview(); await state.previewDraft();
  let saves=0;
  h.routes.set(`POST ${path}`,(_req,reply)=>{saves++;reply({error:{code:'STUDY_PREVIEW_CHANGED'}},409);});
  await state.save(); assert.equal(state.preview.value,null); assert.equal(state.valid.value,true);
  assert.equal(state.hasUnsavedChanges.value,true); assert.match(state.error.value,/重新预览/);
  await state.save(); assert.equal(saves,1);
  await state.previewDraft();
  h.routes.set(`POST ${path}`,(_req,reply)=>reply({error:{code:'STUDY_SETTING_VERSION_CONFLICT'}},409));
  await state.save(); assert.equal(state.valid.value,false); assert.deepEqual(state.draft.value,policy());
  await state.refresh(); assert.equal(state.draft.value.mode,'Disabled'); assert.equal(state.valid.value,true);
});

test('late previews cannot overwrite edited drafts or a different school, and disposal ignores replies',async()=>{
  const {state,school,unmount}=await editor(); state.draft.value=policy(); const held=deferred();
  h.routes.set(`POST ${path}/preview`,async(req,reply)=>{await held.promise;reply(envelope(req,preview()),200,true);});
  const pending=state.previewDraft(); await eventually(()=>assert.ok(h.requests.some(r=>r.path.endsWith('/preview'))));
  state.draft.value.settings.homework.rotationSeconds=90; held.resolve(); await pending; assert.equal(state.preview.value,null);
  const old=deferred(); h.routes.set(`GET ${path}`,async(req,reply)=>{await old.promise;reply(envelope(req,catalog()),200,true);});
  const refreshing=state.refresh();
  h.routes.set('GET /api/v2/npep/schools/other/study-settings',(req,reply)=>reply(envelope(req,{...catalog(),grades:[{id:'other-grade',name:'别校'}]}),200,true));
  school.value='other'; await eventually(()=>assert.equal(state.targetId.value,'other-grade'));
  old.resolve(); await refreshing; assert.equal(state.targetId.value,'other-grade');
  const disposed=deferred(); h.routes.set('GET /api/v2/npep/schools/other/study-settings',async(req,reply)=>{await disposed.promise;reply(envelope(req,catalog()),200,true);});
  const loading=state.refresh(); unmount(); disposed.resolve(); await loading;
  assert.equal(state.targetId.value,'other-grade');
});
