import test from 'node:test';import assert from 'node:assert/strict';
import {RecognitionSession} from '../../src/features/handwriting/recognition-session.js';
const workers=[];
class FakeWorker extends globalThis.EventTarget{
  constructor(){super();this.messages=[];this.terminated=false;workers.push(this);}
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated=true;}
  reply(type,extra={}){this.onmessage?.({data:{id:this.messages.at(-1).id,type,...extra}});}
}
globalThis.Worker=FakeWorker;globalThis.document={hidden:false};
const lines=()=>[{row:0,width:320,data:new Float32Array(3*48*320)}];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function prepared(worker,resources={}){worker.reply('prepared',{resources});await tick();assert.equal(worker.terminated,true);return workers.at(-1);}
Object.defineProperty(globalThis.navigator,'locks',{value:undefined,configurable:true});

for (const stage of ['preparation', 'computation']) test(`malformed ${stage} message rejects promptly and releases the worker`, async () => {
  const session = new RecognitionSession(() => {}), request = session.recognize(lines);
  const settled = request.then(() => 'resolved', () => 'rejected');
  try {
    await tick(); const worker = stage === 'computation' ? await prepared(workers.at(-1)) : workers.at(-1);
    assert.doesNotThrow(() => worker.onmessage({data: null}));
    assert.equal(await Promise.race([settled, new Promise(resolve => setTimeout(() => resolve('pending'), 50))]), 'rejected');
    assert.equal(worker.terminated, true); assert.equal(session.pending, null);
  } finally { session.dispose(); await settled; }
});
test('a preparation reply cannot settle a computation as a successful ready model', async () => {
  const session = new RecognitionSession(() => {}), request = session.recognize(lines);
  const settled = request.then(() => 'resolved', () => 'rejected');
  try {
    await tick(); const worker = await prepared(workers.at(-1)); worker.reply('prepared', {resources: {offline: true}});
    assert.equal(await settled, 'rejected'); assert.equal(session.ready, false); assert.equal(worker.terminated, true);
  } finally { session.dispose(); await settled; }
});
test('canceled cold preparation cannot cancel an immediate retry',async()=>{
  const s=new RecognitionSession(()=>{});
  const old=s.recognize(lines);const oldRejected=assert.rejects(old,/取消/);
  await tick();const oldWorker=workers.at(-1);s.dispose();const retry=s.recognize(lines);
  await tick();const replacement=workers.at(-1);assert.notEqual(replacement,oldWorker);assert.equal(replacement.terminated,false);
  const compute=await prepared(replacement,{offline:true});compute.reply('result',{lines:[{text:'第12—15页'}]});
  assert.equal((await retry).lines[0].text,'第12—15页');await oldRejected;assert.equal(compute.terminated,false);s.dispose();
});
test('late old messages cannot resolve a newer request',async()=>{
  const s=new RecognitionSession(()=>{}),old=s.recognize(lines),rejected=assert.rejects(old);
  await tick();const first=workers.at(-1);s.dispose();await rejected;
  const retry=s.recognize(lines);await tick();const next=workers.at(-1);first.reply('result',{lines:[{text:'旧结果'}]});
  const compute=await prepared(next);compute.reply('result',{lines:[{text:'新结果'}]});assert.equal((await retry).lines[0].text,'新结果');s.dispose();
});
test('warm requests reuse one worker and do not prepare twice',async()=>{
  const s=new RecognitionSession(()=>{}),first=s.recognize(lines);await tick();const resource=workers.at(-1),w=await prepared(resource);w.reply('result',{lines:[]});await first;
  const handler=s.messageErrorHandler,second=s.recognize(lines);await tick();assert.equal(workers.at(-1),w);assert.equal(s.messageErrorHandler,handler);assert.equal(resource.messages.filter(m=>m.type==='prepare-resources').length,1);assert.equal(w.messages.filter(m=>m.type==='prepare-resources').length,0);w.reply('result',{lines:[]});await second;s.dispose();assert.equal(s.messageErrorHandler,null);
});
test('failed resource preparation never creates input tensors and releases owner',async()=>{
  let preprocessed=0;const s=new RecognitionSession(()=>{}),request=s.recognize(()=>{preprocessed++;return lines();}),rejected=assert.rejects(request,/校验/);
  await tick();const w=workers.at(-1);w.reply('error',{message:'校验失败'});await rejected;assert.equal(preprocessed,0);assert.equal(w.terminated,true);
  const other=new RecognitionSession(()=>{});const retry=other.recognize(lines),again=assert.rejects(retry);await tick();other.dispose();await again;s.dispose();
});
test('cancel before asynchronous Web Lock acquisition releases the old gate only',async()=>{
  const callbacks=[];
  Object.defineProperty(navigator,'locks',{value:{request(_name,_options,callback){callbacks.push(callback);return Promise.resolve();}},configurable:true});
  const s=new RecognitionSession(()=>{}),old=s.recognize(lines),rejected=assert.rejects(old);
  s.dispose();const retry=s.recognize(lines);await callbacks[0]({name:'old'});await tick();await rejected;
  let released=false;const currentGate=callbacks[1]({name:'new'}).then(()=>{released=true;});await tick();assert.equal(released,false);
  const w=workers.at(-1);assert.equal(w.terminated,false);const compute=await prepared(w);compute.reply('result',{lines:[]});await retry;assert.equal(released,false);
  s.dispose();await currentGate;assert.equal(released,true);Object.defineProperty(navigator,'locks',{value:undefined,configurable:true});
});

test('cancel settles recognition even when the browser never answers the lock request', async () => {
  let callback;
  Object.defineProperty(navigator, 'locks', {value: {request(_name, _options, handler) {
    callback = handler; return new Promise(() => {});
  }}, configurable: true});
  const session = new RecognitionSession(() => {}), request = session.recognize(lines);
  const settled = request.then(() => 'resolved', () => 'rejected');
  try {
    session.dispose();
    assert.equal(await Promise.race([settled, new Promise(resolve => setTimeout(() => resolve('pending'), 50))]), 'rejected');
    assert.equal(session.worker, null);
  } finally {
    session.dispose(); await callback(null); await settled;
    Object.defineProperty(navigator, 'locks', {value: undefined, configurable: true});
  }
});

test('a silent browser lock has the same bounded wait as worker requests and releases ownership', async t => {
  let callback, failure;
  Object.defineProperty(navigator, 'locks', {value: {request(_name, _options, handler) {
    callback = handler; return new Promise(() => {});
  }}, configurable: true});
  t.mock.timers.enable({apis: ['setTimeout']});
  const session = new RecognitionSession(() => {}), request = session.recognize(lines).catch(error => { failure = error; });
  try {
    t.mock.timers.tick(90001);
    for (let step = 0; step < 8; step++) await Promise.resolve();
    assert.match(failure?.message || 'still pending', /超时/);
    assert.equal(session.controller, null);
    assert.equal(session.unlock, null);
    assert.equal(session.worker, null);
  } finally {
    session.dispose(); await callback(null); await request; t.mock.timers.reset();
    Object.defineProperty(navigator, 'locks', {value: undefined, configurable: true});
  }
});

test('message decode failure rejects promptly and permits a fresh retry',async()=>{
  const s=new RecognitionSession(()=>{}),request=s.recognize(lines),rejected=assert.rejects(request,/通信/);
  try{
    await tick();const compute=await prepared(workers.at(-1));
    assert.equal(typeof s.messageErrorHandler,'function');compute.dispatchEvent(new globalThis.Event('messageerror'));await rejected;
    assert.equal(compute.terminated,true);assert.equal(s.pending,null);assert.equal(s.worker,null);
    const retry=s.recognize(lines);await tick();const replacement=await prepared(workers.at(-1));replacement.reply('result',{lines:[{text:'第8题'}]});assert.equal((await retry).lines[0].text,'第8题');
  }finally{s.dispose('通信测试收尾');await rejected;}
});

test('a retired worker error callback cannot dispose a newer worker',async()=>{
  const s=new RecognitionSession(()=>{}),first=s.recognize(lines);await tick();const old=await prepared(workers.at(-1));old.reply('result',{lines:[]});await first;
  const oldError=old.onerror,oldMessageError=s.messageErrorHandler;s.dispose();
  const retry=s.recognize(lines);await tick();const replacement=await prepared(workers.at(-1));
  try{oldError();oldMessageError?.();assert.equal(replacement.terminated,false);replacement.reply('result',{lines:[{text:'新结果'}]});assert.equal((await retry).lines[0].text,'新结果');}
  finally{s.dispose();await retry.catch(()=>{});}
});
async function successfulSession(){const session=new RecognitionSession(()=>{}),request=session.recognize(lines);await tick();const compute=await prepared(workers.at(-1));compute.reply('result',{lines:[]});await request;return session;}
test('a computation error requests one receipt check across replacement sessions',async()=>{
  const sessions=[],pending=[];try{
    const clean=await successfulSession();clean.dispose();
    const broken=new RecognitionSession(()=>{});sessions.push(broken);const first=broken.recognize(lines);pending.push(first);const rejected=assert.rejects(first,/模型/);await tick();const compute=await prepared(workers.at(-1));compute.reply('error',{message:'模型校验失败'});await rejected;
    const retry=new RecognitionSession(()=>{});sessions.push(retry);const second=retry.recognize(lines);pending.push(second);await tick();assert.equal(workers.at(-1).messages.at(-1).verifyCached,true);
    const recovered=await prepared(workers.at(-1));recovered.reply('result',{lines:[]});await second;retry.dispose();
    const next=new RecognitionSession(()=>{});sessions.push(next);const third=next.recognize(lines);pending.push(third);await tick();assert.equal(Boolean(workers.at(-1).messages.at(-1).verifyCached),false);const warmed=await prepared(workers.at(-1));warmed.reply('result',{lines:[]});await third;
  }finally{for(const session of sessions)session.dispose();await Promise.allSettled(pending);}
});
test('ordinary cancellation does not request expensive receipt verification',async()=>{
  const sessions=[],pending=[];try{
    const clean=await successfulSession();clean.dispose();
    const canceled=new RecognitionSession(()=>{});sessions.push(canceled);const first=canceled.recognize(lines);pending.push(first);const rejected=assert.rejects(first);await tick();await prepared(workers.at(-1));canceled.dispose();await rejected;
    const retry=new RecognitionSession(()=>{});sessions.push(retry);const second=retry.recognize(lines);pending.push(second);await tick();assert.equal(Boolean(workers.at(-1).messages.at(-1).verifyCached),false);const compute=await prepared(workers.at(-1));compute.reply('result',{lines:[]});await second;
  }finally{for(const session of sessions)session.dispose();await Promise.allSettled(pending);}
});
test('compute worker crashes and message decode failures request receipt verification',async()=>{
  const sessions=[],pending=[];try{for(const fault of ['error','messageerror']){
    const clean=await successfulSession();clean.dispose();const broken=new RecognitionSession(()=>{});sessions.push(broken);const first=broken.recognize(lines);pending.push(first);const rejected=assert.rejects(first);await tick();const compute=await prepared(workers.at(-1));if(fault==='error')compute.onerror();else compute.dispatchEvent(new globalThis.Event('messageerror'));await rejected;
    const retry=new RecognitionSession(()=>{});sessions.push(retry);const second=retry.recognize(lines);pending.push(second);await tick();assert.equal(workers.at(-1).messages.at(-1).verifyCached,true);const recovered=await prepared(workers.at(-1));recovered.reply('result',{lines:[]});await second;retry.dispose();
  }}finally{for(const session of sessions)session.dispose();await Promise.allSettled(pending);}
});
test('canceling a required check preserves the recovery marker until verification succeeds',async()=>{
  const sessions=[],pending=[];try{
    const clean=await successfulSession();clean.dispose();const broken=new RecognitionSession(()=>{});sessions.push(broken);const first=broken.recognize(lines);pending.push(first);const failed=assert.rejects(first);await tick();const compute=await prepared(workers.at(-1));compute.reply('error',{message:'模型失败'});await failed;
    const canceled=new RecognitionSession(()=>{});sessions.push(canceled);const second=canceled.recognize(lines);pending.push(second);const rejected=assert.rejects(second);await tick();assert.equal(workers.at(-1).messages.at(-1).verifyCached,true);canceled.dispose();await rejected;
    const retry=new RecognitionSession(()=>{});sessions.push(retry);const third=retry.recognize(lines);pending.push(third);await tick();assert.equal(workers.at(-1).messages.at(-1).verifyCached,true);const recovered=await prepared(workers.at(-1));recovered.reply('result',{lines:[]});await third;
  }finally{for(const session of sessions)session.dispose();await Promise.allSettled(pending);}
});
