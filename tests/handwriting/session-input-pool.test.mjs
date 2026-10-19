import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RecognitionSession} from '../../src/features/handwriting/recognition-session.js';
import pins from '../../src/features/handwriting/resource-pins.js';
const workers=[];
class FakeWorker extends globalThis.EventTarget {
  constructor(){super();this.messages=[];workers.push(this);}
  postMessage(message,transfer=[]){this.messages.push(globalThis.structuredClone(message,{transfer}));}
  terminate(){this.terminated=true;}
  reply(data){this.onmessage?.({data:{id:this.messages.at(-1).id,...data}});}
  result(extra={}){const message=this.messages.at(-1),buffers=message.lines.map(l=>l.data.buffer);const reply=globalThis.structuredClone({id:message.id,type:'result',inputReuseVersion:1,returnedInputBuffers:buffers,lines:[{text:'第12—15页'}],...extra},{transfer:buffers});this.onmessage?.({data:reply});}
}
globalThis.Worker=FakeWorker;globalThis.document={hidden:false};
Object.defineProperty(globalThis.navigator,'locks',{value:undefined,configurable:true});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const lines=pool=>[{row:0,width:320,data:pool.take(3*48*320)}];
async function prepared(){const resource=workers.at(-1);resource.reply({type:'prepared',resources:{}});await tick();assert.equal(resource.terminated,true);return workers.at(-1);}

test('new pinned runtime with the same declared input protocol retains the bounded pool',()=>{
  const original={version:pins.version,inputReuseVersion:pins.inputReuseVersion};
  try{
    pins.version='r19';pins.inputReuseVersion=1;
    const candidate=new RecognitionSession(()=>{});assert.ok(candidate.inputPool);candidate.dispose();
    pins.inputReuseVersion=2;
    const unsupported=new RecognitionSession(()=>{});assert.equal(unsupported.inputPool,null);unsupported.dispose();
    pins.version='r18';delete pins.inputReuseVersion;
    const baseline=new RecognitionSession(()=>{});assert.ok(baseline.inputPool);baseline.dispose();
  }finally{pins.version=original.version;if(original.inputReuseVersion===undefined)delete pins.inputReuseVersion;else pins.inputReuseVersion=original.inputReuseVersion;}
});
test('returned buffers are consumed before resolving and never enter text result/history',async()=>{
  const s=new RecognitionSession(()=>{},{reuseInputs:true}),a=s.recognize(lines);await tick();const compute=await prepared();
  assert.equal(compute.messages.at(-1).inputReuseVersion,1);compute.result();const first=await a;
  assert.equal('returnedInputBuffers' in first,false);assert.equal(first.inputPoolStats.available,1);
  const b=s.recognize(pool=>{const row=lines(pool);assert.ok(row[0].data.every(v=>v===0));return row;});await tick();compute.result();const next=await b;
  assert.equal(next.inputPoolStats.allocations,1);assert.equal(next.inputPoolStats.returns,2);s.dispose();assert.equal(s.inputPool.stats().retainedCapacity,0);
});
test('invalid return rejects the task, releases owner and cannot poison a retry',async()=>{
  const s=new RecognitionSession(()=>{},{reuseInputs:true}),a=s.recognize(lines),rejected=assert.rejects(a,/归还异常/);await tick();const compute=await prepared();
  compute.reply({type:'result',inputReuseVersion:1,returnedInputBuffers:[new ArrayBuffer(1)],lines:[]});await rejected;
  assert.equal(compute.terminated,true);assert.equal(s.inputPool.stats().retainedCapacity,0);
  const b=s.recognize(lines);await tick();const next=await prepared();next.result();await b;s.dispose();
});
test('late returned buffers from canceled generation cannot enter the new pool',async()=>{
  const s=new RecognitionSession(()=>{},{reuseInputs:true}),old=s.recognize(lines),rejected=assert.rejects(old);await tick();const first=await prepared(),callback=first.onmessage,oldId=first.messages.at(-1).id;
  s.dispose();await rejected;const current=s.recognize(lines);await tick();
  callback({data:{id:oldId,type:'result',inputReuseVersion:1,returnedInputBuffers:[new ArrayBuffer(884736)],lines:[{text:'旧'}]}});
  assert.equal(s.inputPool.stats().available,0);const compute=await prepared();compute.result();assert.equal((await current).lines[0].text,'第12—15页');s.dispose();
});
test('worker errors retain their cause and clear every lease',async()=>{
  const s=new RecognitionSession(()=>{},{reuseInputs:true}),a=s.recognize(lines),rejected=assert.rejects(a,/测试失败/);await tick();const compute=await prepared();compute.reply({type:'error',message:'测试失败'});await rejected;assert.equal(s.inputPool.stats().retainedCapacity,0);
});
