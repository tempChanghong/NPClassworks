import {before, beforeEach, after, test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => { h.reset(); h.api.saveAccountTokens({accessToken:"account-token",refreshToken:"account-session"}); h.api.saveClassroomScreenToken("screen-token"); });
const path = "/api/v2/npep/screen/pairing";
const envelope = (id, data) => ({protocolVersion:"0.1",requestId:id,serverTime:new Date().toISOString(),data});
const status = {enabled:true,occupied:false,screenBindingId:"screen-a",schoolName:"学校",administrativeClassName:"一班",screenBindingName:"大屏"};

const accessPath = '/api/v2/npep/schools/school/pairing-access';
const bulkPreview = (extra = {}) => ({termId:'term',termName:'当前学期',targetType:'SCHOOL',targetId:null,targetName:'全校',enabled:true,
  previewDigest:'a'.repeat(64),totalScreens:2,changedScreens:1,unchangedScreens:1,excludedScreens:1,truncated:false,
  items:[{screenBindingId:'screen-a',name:'大屏',administrativeClassName:'一班',changed:true}],...extra});
async function openBatch() {
  h.api.clearClassroomScreenToken(); h.api.saveAccountTokens({accessToken:'account-token',refreshToken:'account-session'});
  h.routes.set(`GET ${accessPath}`,(req,reply)=>reply(envelope(req.headers['x-request-id'],{items:[{screenBindingId:'screen-a',enabled:false,revision:1}]}),200,true));
  const page = await h.openNpepPairing({management:true,termId:'term',bindings:[{id:'screen-a',isActive:true,
    administrativeClass:{termId:'term',gradeId:'grade',grade:{name:'高一'},isActive:true,term:{id:'term',status:'ACTIVE'}}}]});
  await eventually(()=>assert.equal(page.state.loaded.value,true));
  h.routes.set(`POST ${accessPath}/preview`,(req,reply)=>reply(envelope(req.body.requestId,bulkPreview({
    targetType:req.body.targetType,targetId:req.body.targetId,enabled:req.body.enabled})),200,true));
  return page;
}
test('Batch requires preview and confirmation, uses administrator identity and reloads saved policies',async()=>{
  const page = await openBatch();
  assert.equal(page.state.canApply.value,false); await page.state.applyBatch();
  assert.equal(h.requests.filter(r=>r.method==='POST' && r.path.startsWith(accessPath)).length,0);
  await page.state.previewBatch(); assert.equal(page.state.canApply.value,false);
  page.state.batchConfirmed.value = true; assert.equal(page.state.canApply.value,true);
  h.routes.set(`POST ${accessPath}/batch`,(req,reply)=>{
    assert.equal(req.headers.authorization,'Bearer account-token'); assert.equal(req.headers['x-classworks-screen-token'],undefined);
    assert.deepEqual(req.body,{requestId:req.body.requestId,termId:'term',targetType:'SCHOOL',targetId:null,enabled:true,previewDigest:'a'.repeat(64)});
    h.routes.set(`GET ${accessPath}`,(r,res)=>res(envelope(r.headers['x-request-id'],{items:[{screenBindingId:'screen-a',enabled:true,revision:2}]}),200,true));
    reply(envelope(req.body.requestId,{...bulkPreview(),applied:true}),200,true);
  });
  await page.state.applyBatch(); assert.equal(page.state.preview.value,null);
  assert.equal(page.state.policies.value['screen-a'].enabled,true); assert.match(page.state.message.value,/1 台/);
});
test('Grade batch binds explicit selection and clears consent immediately after changing action',async()=>{
  const page = await openBatch(); page.state.targetType.value = 'GRADE';
  assert.equal(page.state.canPreview.value,false); page.state.gradeId.value = 'grade';
  await page.state.previewBatch(); page.state.batchConfirmed.value = true;
  assert.equal(page.state.preview.value.targetId,'grade'); assert.equal(page.state.canApply.value,true);
  page.state.batchEnabled.value = false;
  assert.equal(page.state.preview.value,null); assert.equal(page.state.canApply.value,false);
  await page.state.applyBatch(); assert.equal(h.requests.some(r=>r.path.endsWith('/batch')),false);
});
test('Batch no-op cannot be applied and changing term discards late preview',async()=>{
  const page = await openBatch();
  h.routes.set(`POST ${accessPath}/preview`,(req,reply)=>reply(envelope(req.body.requestId,bulkPreview({changedScreens:0,unchangedScreens:2})),200,true));
  await page.state.previewBatch(); page.state.batchConfirmed.value = true; assert.equal(page.state.canApply.value,false);
  const held = deferred();
  h.routes.set(`POST ${accessPath}/preview`,async(req,reply)=>{await held.promise;reply(envelope(req.body.requestId,bulkPreview()),200,true);});
  const pending = page.state.previewBatch();
  await eventually(()=>assert.equal(h.requests.filter(r=>r.path.endsWith('/preview')).length,2));
  page.props.termId = 'new-term'; held.resolve(); await pending;
  await eventually(()=>assert.equal(page.state.busy.value,false));
  assert.equal(page.state.preview.value,null); assert.equal(page.state.batchConfirmed.value,false);
});
test('A stale batch is not retried blindly and requires refreshing before a new preview',async()=>{
  const page = await openBatch(); await page.state.previewBatch(); page.state.batchConfirmed.value = true;
  h.routes.set(`POST ${accessPath}/batch`,(req,reply)=>reply({...envelope(req.body.requestId,null),error:{code:'PREAUTHORIZATION_CHANGED',message:'PREAUTHORIZATION_CHANGED',retryAfterSeconds:null}},409,true));
  await page.state.applyBatch(); assert.equal(page.state.preview.value,null); assert.equal(page.state.loaded.value,false);
  assert.match(page.state.error.value,/重新预览/);
  assert.equal(page.state.canPreview.value,false); await page.state.applyBatch();
  assert.equal(h.requests.filter(r=>r.path.endsWith('/batch')).length,1);
  await page.state.refresh(); assert.equal(page.state.canPreview.value,true);
});

test("Web code uses screen identity and never sends an administrator token", async () => {
  h.routes.set(`GET ${path}`, (req, reply) => {
    assert.equal(req.headers["x-classworks-screen-token"],"screen-token");
    assert.equal(req.headers.authorization,undefined);
    reply(envelope(req.headers["x-request-id"],status),200,true);
  });
  const result = await h.api.npepScreenPairingApi.request(null);
  assert.equal(result.screenBindingId,"screen-a");
  assert.match(result.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
});

test("Generating a code keeps the caller's retry identity and does not persist the code", async () => {
  const requestId = randomUUID();
  h.routes.set(`POST ${path}`, (req,reply) => {
    assert.deepEqual(req.body,{requestId});
    assert.equal(req.headers["x-request-id"],requestId);
    assert.equal(req.headers.authorization,undefined);
    reply(envelope(requestId,{userCode:"ABCD2345",expiresAt:new Date(Date.now()+600000).toISOString(),state:"READY"}),201,true);
  });
  assert.equal((await h.api.npepScreenPairingApi.request({requestId})).userCode,"ABCD2345");
  for (const storage of [localStorage,sessionStorage]) for (let i=0;i<storage.length;i++) assert.ok(!storage.getItem(storage.key(i)).includes("ABCD2345"));
});

test("Rotated screen login discards an in-flight code reply", async () => {
  const held = deferred();
  h.routes.set(`POST ${path}`, async (req,reply) => {
    await held.promise;
    reply(envelope(req.body.requestId,{userCode:"ABCD2345",expiresAt:new Date(Date.now()+600000).toISOString(),state:"READY"}),201,true);
  });
  const result = h.api.npepScreenPairingApi.request({requestId:randomUUID()}).catch(error=>error);
  await eventually(()=>assert.ok(h.requests.some(req=>req.path===path)));
  h.api.saveClassroomScreenToken("another-screen"); held.resolve();
  assert.equal((await result).code,"ERR_CANCELED");
});

test("Mismatched envelopes and malformed code payloads are rejected", async () => {
  h.routes.set(`GET ${path}`, (_req,reply)=>reply(envelope(randomUUID(),status),200,true));
  await assert.rejects(h.api.npepScreenPairingApi.request(null),/响应不兼容/);
  h.routes.set(`POST ${path}`, (req,reply)=>reply(envelope(req.body.requestId,{userCode:"garbage",state:"READY",expiresAt:"yesterday"}),201,true));
  await assert.rejects(h.api.npepScreenPairingApi.request({requestId:randomUUID()}),/响应不兼容/);
});

test("Preauthorization write uses school administrator identity and expected revision", async () => {
  h.api.clearClassroomScreenToken();
  h.api.saveAccountTokens({accessToken:"account-token",refreshToken:"account-session"});
  const requestId = randomUUID();
  h.routes.set("POST /api/v2/npep/schools/school/screen-bindings/screen-a/pairing-access", (req,reply)=>{
    assert.equal(req.headers.authorization,"Bearer account-token");
    assert.equal(req.headers["x-classworks-screen-token"],undefined);
    assert.deepEqual(req.body,{requestId,enabled:true,expectedRevision:1});
    reply(envelope(requestId,{screenBindingId:"screen-a",enabled:true,revision:2}),200,true);
  });
  const result = await h.api.npepAdminApi.setPairingAccess("school","screen-a",{requestId,enabled:true,expectedRevision:1});
  assert.equal(result.data.revision,2);
});

test("Screen component hides the previous code while ambiguous replacement is pending and retries the same ID", async () => {
  h.routes.set(`GET ${path}`, (req,reply)=>reply(envelope(req.headers["x-request-id"],status),200,true));
  const page = await h.openNpepPairing();
  await eventually(()=>assert.equal(page.state.status.value?.enabled,true));
  h.routes.set(`POST ${path}`, (req,reply)=>reply(envelope(req.body.requestId,{userCode:"ABCD2345",expiresAt:new Date(Date.now()+600000).toISOString(),state:"READY"}),201,true));
  await page.state.generate(); assert.equal(page.state.ticket.value.userCode,"ABCD2345");
  const held = deferred(); let failedId;
  h.routes.set(`POST ${path}`, async (req,reply)=>{
    failedId = req.body.requestId; await held.promise;
    reply({error:{code:"TEMPORARILY_UNAVAILABLE"}},503);
  });
  const pending = page.state.generate();
  assert.equal(page.state.ticket.value,null);
  await eventually(()=>assert.ok(failedId)); held.resolve(); await pending;
  assert.equal(page.state.ticket.value,null);
  h.routes.set(`POST ${path}`, (req,reply)=>{
    assert.equal(req.body.requestId,failedId);
    reply(envelope(failedId,{userCode:"WXYZ2345",expiresAt:new Date(Date.now()+600000).toISOString(),state:"READY"}),201,true);
  });
  await page.state.generate(); assert.equal(page.state.ticket.value.userCode,"WXYZ2345");
  page.unmount(); assert.equal(page.state.ticket.value,null);
});

test("Management component cannot apply a response from a previous school", async () => {
  h.api.clearClassroomScreenToken(); h.api.saveAccountTokens({accessToken:"account-token",refreshToken:"account-session"});
  const accessPath = "/api/v2/npep/schools/school/pairing-access";
  h.routes.set(`GET ${accessPath}`, (req,reply)=>reply(envelope(req.headers["x-request-id"],{items:[{screenBindingId:"screen-a",enabled:false,revision:1}]}),200,true));
  h.routes.set("GET /api/v2/npep/schools/other/pairing-access",(req,reply)=>reply(envelope(req.headers["x-request-id"],{items:[]}),200,true));
  const page = await h.openNpepPairing({management:true,bindings:[{id:"screen-a",isActive:true,administrativeClass:{isActive:true,term:{status:"ACTIVE"}}}]});
  await eventually(()=>assert.equal(page.state.loaded.value,true));
  assert.equal(page.state.eligible.value.length,1);
  const held = deferred();
  h.routes.set("POST /api/v2/npep/schools/school/screen-bindings/screen-a/pairing-access",async (req,reply)=>{
    await held.promise; reply(envelope(req.body.requestId,{screenBindingId:"screen-a",enabled:true,revision:2}),200,true);
  });
  const pending = page.state.toggle("screen-a");
  await eventually(()=>assert.ok(h.requests.some(req=>req.method==="POST")));
  page.props.schoolId = "other";
  await eventually(()=>assert.ok(h.requests.some(req=>req.path.includes("/other/"))));
  held.resolve(); await pending;
  await eventually(()=>assert.equal(page.state.loaded.value,true));
  assert.deepEqual(page.state.policies.value,{});
});
