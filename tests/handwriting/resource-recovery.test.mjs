import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import pins from '../../src/features/handwriting/resource-pins.js';
import {ensureResources, offlineReady} from '../../src/features/handwriting/resource-manager.js';
const good=new Uint8Array([1,2,3,4,5,6,7,8]),bad=new Uint8Array([0]);
const file={path:'/handwriting-lab/test/runtime.wasm',bytes:good.length,sha256:createHash('sha256').update(good).digest('hex')};
async function fixture(run,testFile=file){
  const original={files:pins.files,caches:globalThis.caches,fetch:globalThis.fetch};
  const state={response:null,deleted:0,fetches:0,puts:0,bodyReads:0,bodyCancels:0};
  const cache={async match(){const response=state.response?.clone();if(response?.body){const getReader=response.body.getReader.bind(response.body);response.body.getReader=()=>{state.bodyReads++;return getReader();};const cancel=response.body.cancel.bind(response.body);response.body.cancel=(...args)=>{state.bodyCancels++;return cancel(...args);};}return response;},async delete(){state.deleted++;state.response=null;return true;},async put(path,response){assert.equal(path,testFile.path);state.puts++;state.response=response.clone();}};
  pins.files=[testFile];globalThis.caches={open:async()=>cache};
  globalThis.fetch=async()=>{state.fetches++;return state.response?.clone()||new globalThis.Response(good);};
  try{await run({state,cache,signal:new AbortController().signal});}
  finally{pins.files=original.files;globalThis.caches=original.caches;globalThis.fetch=original.fetch;}
}
test('unverified bad cache entry is evicted before CacheFirst can repeat it',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(bad);const out=await ensureResources(()=>{},signal);
  assert.equal(out.offline,true);assert.equal(state.deleted,1);assert.equal(state.fetches,1);assert.equal(state.response.headers.get('X-Handwriting-SHA256'),file.sha256);assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
}));
test('unverified good bytes are revalidated and stamped without deleting or fetching',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(good);globalThis.fetch=async()=>{throw Error('Offline network must not be needed');};
  const out=await ensureResources(()=>{},signal);assert.equal(out.offline,true);assert.equal(state.deleted,0);assert.equal(state.puts,1);assert.equal(state.response.headers.get('X-Handwriting-SHA256'),file.sha256);
}));
test('verified cache fast path does not reread bodies or allocate a new response',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(good,{headers:{'X-Handwriting-SHA256':file.sha256}});const out=await ensureResources(()=>{},signal);assert.equal(out.offline,true);assert.equal(state.bodyReads,0);assert.equal(state.fetches,0);assert.equal(state.puts,0);
}));
test('abort during unverified cache read leaves entry untouched',()=>fixture(async({state,cache})=>{
  state.response=new globalThis.Response(good);const controller=new AbortController(),match=cache.match.bind(cache);
  cache.match=async()=>{const hit=await match(),getReader=hit.body.getReader.bind(hit.body);hit.body.getReader=()=>{const reader=getReader(),read=reader.read.bind(reader);reader.read=async()=>{const result=await read();controller.abort();return result;};return reader;};return hit;};
  await assert.rejects(ensureResources(()=>{},controller.signal),{name:'AbortError'});assert.equal(state.deleted,0);assert.equal(state.fetches,0);assert.equal(state.puts,0);
}));
test('cache repair write failure retains validated online use and discloses offline warning',()=>fixture(async({state,cache,signal})=>{
  state.response=new globalThis.Response(good);cache.put=async()=>{throw Error('Quota');};const out=await ensureResources(()=>{},signal);assert.equal(out.offline,false);assert.match(out.warning,/离线缓存/);assert.equal(state.deleted,0);
}));
test('bad network replacement is still rejected and never receives a receipt',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(bad);globalThis.fetch=async()=>new globalThis.Response(bad);
  await assert.rejects(ensureResources(()=>{},signal),/校验失败/);assert.equal(state.deleted,1);assert.equal(state.puts,0);assert.equal(state.response,null);
}));
test('unreadable unverified cache body is replaced, without changing other cache keys',()=>fixture(async({state,cache,signal})=>{
  cache.match=async()=>new globalThis.Response(new globalThis.ReadableStream({start(controller){controller.error(Error('Unreadable entry'));}}));
  await ensureResources(()=>{},signal);assert.equal(state.deleted,1);assert.equal(state.fetches,1);assert.equal(state.puts,1);
}));
test('same-size cache bytes with the wrong SHA are replaced rather than stamped',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(new Uint8Array(good.length));await ensureResources(()=>{},signal);
  assert.equal(state.deleted,1);assert.equal(state.fetches,1);assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
}));
test('failed eviction reports a recoverable error and never trusts the corrupt entry',()=>fixture(async({state,cache,signal})=>{
  state.response=new globalThis.Response(bad);cache.delete=async()=>{throw Error('Storage unavailable');};
  await assert.rejects(ensureResources(()=>{},signal),/无法更新已损坏/);assert.equal(state.puts,0);assert.equal(state.fetches,0);assert.equal(state.response.headers.get('X-Handwriting-SHA256'),null);
}));
test('failure-triggered verification repairs bad bytes even with an old valid receipt',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(bad,{headers:{'X-Handwriting-SHA256':file.sha256}});
  const result=await ensureResources(()=>{},signal,{verifyCached:true});assert.equal(result.offline,true);assert.equal(state.bodyReads,1);assert.equal(state.deleted,1);assert.equal(state.fetches,1);assert.equal(state.puts,1);assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
}));
test('forced verification of healthy receipted bytes reads once without refetch or rewrite',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(good,{headers:{'X-Handwriting-SHA256':file.sha256}});
  const result=await ensureResources(()=>{},signal,{verifyCached:true});assert.equal(result.offline,true);assert.equal(state.bodyReads,1);assert.equal(state.deleted,0);assert.equal(state.fetches,0);assert.equal(state.puts,0);
}));
test('forced verification checks SHA rather than trusting receipt and matching size',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(new Uint8Array(good.length),{headers:{'X-Handwriting-SHA256':file.sha256}});
  await ensureResources(()=>{},signal,{verifyCached:true});assert.equal(state.deleted,1);assert.equal(state.fetches,1);assert.equal(state.puts,1);assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
}));
test('canceling a forced receipt check cannot delete or rewrite the entry',()=>fixture(async({state,cache})=>{
  state.response=new globalThis.Response(good,{headers:{'X-Handwriting-SHA256':file.sha256}});const controller=new AbortController(),match=cache.match.bind(cache);
  cache.match=async()=>{const hit=await match(),getReader=hit.body.getReader.bind(hit.body);hit.body.getReader=()=>{const reader=getReader(),read=reader.read.bind(reader);reader.read=async()=>{const result=await read();controller.abort();return result;};return reader;};return hit;};
  await assert.rejects(ensureResources(()=>{},controller.signal,{verifyCached:true}),{name:'AbortError'});assert.equal(state.deleted,0);assert.equal(state.puts,0);assert.equal(state.fetches,0);
}));
test('failed forced eviction cannot silently reuse a bad receipted entry',()=>fixture(async({state,cache,signal})=>{
  state.response=new globalThis.Response(bad,{headers:{'X-Handwriting-SHA256':file.sha256}});cache.delete=async()=>{throw Error('Storage unavailable');};
  await assert.rejects(ensureResources(()=>{},signal,{verifyCached:true}),/无法更新已损坏/);assert.equal(state.puts,0);assert.equal(state.fetches,0);
}));

const scriptFile={...file,path:'/handwriting-lab/test/runtime.mjs'};
test('a cached HTTP failure with valid bytes and receipt is not offline-ready and repairs without network',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(good,{status:503,headers:{'Content-Type':'text/javascript','X-Handwriting-SHA256':file.sha256}});
  globalThis.fetch=async()=>{throw Error('Offline status repair must not fetch');};
  assert.equal(await offlineReady(),false);
  assert.equal((await ensureResources(()=>{},signal)).offline,true);
  assert.equal(state.bodyReads,1);assert.equal(state.puts,1);assert.equal(state.fetches,0);assert.equal(state.deleted,0);
  assert.equal(state.response.status,200);assert.equal(await offlineReady(),true);assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
},scriptFile));
test('forced verification also repairs an HTTP error status instead of accepting a matching receipt',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(good,{status:404,headers:{'X-Handwriting-SHA256':file.sha256}});
  await ensureResources(()=>{},signal,{verifyCached:true});assert.equal(state.bodyReads,1);assert.equal(state.puts,1);assert.equal(state.response.status,200);assert.equal(state.fetches,0);
}));
test('failed status repair never advertises an unusable entry as available',()=>fixture(async({state,cache,signal})=>{
  state.response=new globalThis.Response(good,{status:503,headers:{'X-Handwriting-SHA256':file.sha256}});cache.put=async()=>{throw Error('Quota');};
  await assert.rejects(ensureResources(()=>{},signal),/修复.*保存/);assert.equal(state.response.status,503);assert.equal(await offlineReady(),false);
}));
test('status repair cannot stamp corrupt bytes even when the receipt matches',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(bad,{status:503,headers:{'X-Handwriting-SHA256':file.sha256}});
  await ensureResources(()=>{},signal);assert.equal(state.deleted,1);assert.equal(state.fetches,1);assert.equal(state.response.status,200);assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
}));
test('after deleting corrupt HTTP-error bytes, cache quota failure still allows verified online use',()=>fixture(async({state,cache,signal})=>{
  state.response=new globalThis.Response(bad,{status:503,headers:{'X-Handwriting-SHA256':file.sha256}});cache.put=async()=>{throw Error('Quota');};
  const result=await ensureResources(()=>{},signal);assert.equal(result.offline,false);assert.match(result.warning,/离线缓存/);assert.equal(state.deleted,1);assert.equal(state.fetches,1);assert.equal(state.response,null);
}));
test('a receipted module with the wrong MIME is revalidated and repaired while offline',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(good,{headers:{'Content-Type':'text/plain','X-Handwriting-SHA256':file.sha256}});
  globalThis.fetch=async()=>{throw Error('Offline repair must not fetch');};
  assert.equal(await offlineReady(),false);
  const result=await ensureResources(()=>{},signal);
  assert.equal(result.offline,true);assert.equal(state.bodyReads,1);assert.equal(state.deleted,0);assert.equal(state.puts,1);assert.equal(state.response.headers.get('Content-Type'),'text/javascript');assert.equal(await offlineReady(),true);assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
},scriptFile));
test('valid JavaScript MIME essences retain the no-read/no-write fast path',()=>fixture(async({state,signal})=>{
  for(const mime of ['text/javascript','Application/JavaScript; charset=utf-8','text/ecmascript','application/x-javascript','text/javascript1.5','text/x-ecmascript']){
    state.response=new globalThis.Response(good,{headers:{'Content-Type':mime,'X-Handwriting-SHA256':file.sha256}});
    assert.equal(await offlineReady(),true);await ensureResources(()=>{},signal);assert.equal(state.bodyReads,0);assert.equal(state.puts,0);assert.equal(state.fetches,0);
  }
},scriptFile));
test('repairing a missing module MIME never stamps a body with the wrong hash',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(new Uint8Array(good.length),{headers:{'X-Handwriting-SHA256':file.sha256}});
  globalThis.fetch=async()=>{state.fetches++;return new globalThis.Response(good,{headers:{'Content-Type':'application/javascript'}});};
  await ensureResources(()=>{},signal);assert.equal(state.deleted,1);assert.equal(state.fetches,1);assert.equal(state.puts,1);assert.equal(state.response.headers.get('Content-Type'),'application/javascript');assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
},scriptFile));
test('new fixed module bytes with a bad server MIME are verified before normalizing their cached MIME',()=>fixture(async({state,signal})=>{
  globalThis.fetch=async()=>{state.fetches++;return new globalThis.Response(good,{headers:{'Content-Type':'application/octet-stream'}});};
  await ensureResources(()=>{},signal);assert.equal(state.fetches,1);assert.equal(state.puts,1);assert.equal(state.response.headers.get('Content-Type'),'text/javascript');assert.equal(state.response.headers.get('X-Handwriting-SHA256'),file.sha256);
},scriptFile));
test('canceling a bad-MIME receipt check cannot rewrite the entry',()=>fixture(async({state,cache})=>{
  state.response=new globalThis.Response(good,{headers:{'Content-Type':'text/plain','X-Handwriting-SHA256':file.sha256}});const controller=new AbortController(),match=cache.match.bind(cache);
  cache.match=async()=>{const hit=await match(),getReader=hit.body.getReader.bind(hit.body);hit.body.getReader=()=>{const reader=getReader(),read=reader.read.bind(reader);reader.read=async()=>{const result=await read();controller.abort();return result;};return reader;};return hit;};
  await assert.rejects(ensureResources(()=>{},controller.signal),{name:'AbortError'});assert.equal(state.deleted,0);assert.equal(state.puts,0);assert.equal(state.fetches,0);assert.equal(state.response.headers.get('Content-Type'),'text/plain');
},scriptFile));
test('a failed MIME-repair write never advertises the unusable module as offline-ready',()=>fixture(async({state,cache,signal})=>{
  state.response=new globalThis.Response(good,{headers:{'Content-Type':'text/plain','X-Handwriting-SHA256':file.sha256}});cache.put=async()=>{throw Error('Quota');};
  await assert.rejects(ensureResources(()=>{},signal),/修复.*保存/);assert.equal(await offlineReady(),false);assert.equal(state.deleted,0);assert.equal(state.response.headers.get('Content-Type'),'text/plain');
},scriptFile));

test('preparation fetches identify their cache writer without dropping abort or HTTP revalidation',()=>fixture(async({state,signal})=>{
  globalThis.fetch=async(path,options)=>{
    state.fetches++;assert.equal(path,file.path);assert.equal(options.signal,signal);assert.equal(options.cache,'no-cache');assert.equal(new globalThis.Headers(options.headers).get('X-Handwriting-Prepare'),'1');return new globalThis.Response(good);
  };
  await ensureResources(()=>{},signal);assert.equal(state.fetches,1);assert.equal(state.puts,1);assert.equal(state.response.headers.get('X-Handwriting-SHA256'),file.sha256);
}));

test('network bodies stop at the first chunk exceeding the fixed decoded size',()=>fixture(async({state,signal})=>{
  let pulls=0,cancels=0;
  globalThis.fetch=async()=>new globalThis.Response(new globalThis.ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(1024));},cancel(){cancels++;}},{highWaterMark:0}));
  await assert.rejects(ensureResources(()=>{},signal),/校验失败/);
  assert.equal(pulls,1);assert.equal(cancels,1);assert.equal(state.puts,0);
}));

test('an oversized cache stream is cancelled and only its fixed entry replaced',()=>fixture(async({state,cache,signal})=>{
  let pulls=0,cancels=0;
  cache.match=async()=>new globalThis.Response(new globalThis.ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(1024));},cancel(){cancels++;}},{highWaterMark:0}));
  globalThis.fetch=async()=>{state.fetches++;return new globalThis.Response(good);};
  assert.equal((await ensureResources(()=>{},signal)).offline,true);
  assert.equal(pulls,1);assert.equal(cancels,1);assert.equal(state.deleted,1);assert.equal(state.fetches,1);assert.equal(state.puts,1);
}));

test('exact-sized chunked bytes ignore compressed Content-Length metadata',()=>fixture(async({state,signal})=>{
  globalThis.fetch=async()=>new globalThis.Response(new globalThis.ReadableStream({start(controller){controller.enqueue(good.slice(0,3));controller.enqueue(good.slice(3));controller.close();}}),{headers:{'Content-Length':'3','Content-Encoding':'gzip'}});
  await ensureResources(()=>{},signal);assert.equal(state.puts,1);assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
}));

test('an extra byte after a full-sized chunk is rejected without reading the rest',()=>fixture(async({state,signal})=>{
  let pulls=0,cancels=0;
  globalThis.fetch=async()=>new globalThis.Response(new globalThis.ReadableStream({pull(controller){controller.enqueue(pulls++===0?good:new Uint8Array([0]));},cancel(){cancels++;}},{highWaterMark:0}));
  await assert.rejects(ensureResources(()=>{},signal),/校验失败/);assert.equal(pulls,2);assert.equal(cancels,1);assert.equal(state.puts,0);
}));

test('a truncated chunked body cannot receive a verification receipt',()=>fixture(async({state,signal})=>{
  globalThis.fetch=async()=>new globalThis.Response(new globalThis.ReadableStream({start(controller){controller.enqueue(good.slice(0,-1));controller.close();}}));
  await assert.rejects(ensureResources(()=>{},signal),/校验失败/);assert.equal(state.puts,0);
}));

for(const source of ['network','cache'])test(`aborting a stalled ${source} body releases the reader without deleting or writing`,()=>fixture(async({state,cache})=>{
  let cancels=0,started;
  const ready=new Promise(resolve=>{started=resolve;}),controller=new AbortController();
  const response=()=>new globalThis.Response(new globalThis.ReadableStream({pull(){started();return new Promise(()=>{});},cancel(){cancels++;}},{highWaterMark:0}));
  if(source==='network')globalThis.fetch=async()=>response();else cache.match=async()=>response();
  const pending=ensureResources(()=>{},controller.signal);await ready;controller.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(cancels,1);assert.equal(state.deleted,0);assert.equal(state.puts,0);
}));

test('cancelling a tee-backed bad cache entry never waits for the other reader',()=>fixture(async({state,cache,signal})=>{
  const stream=new globalThis.ReadableStream({pull(controller){controller.enqueue(new Uint8Array(32));}},{highWaterMark:0}),[owned,other]=stream.tee();
  cache.match=async()=>new globalThis.Response(owned);
  try{assert.equal((await ensureResources(()=>{},signal)).offline,true);assert.equal(state.deleted,1);assert.equal(state.puts,1);}
  finally{await other.cancel();}
}));

test('successful readiness checks discard the returned body without reading stored bytes',()=>fixture(async({state})=>{
  state.response=new globalThis.Response(good,{headers:{'X-Handwriting-SHA256':file.sha256}});
  assert.equal(await offlineReady(),true);assert.equal(state.bodyCancels,1);assert.equal(state.bodyReads,0);assert.equal(state.puts,0);assert.equal(state.deleted,0);
  assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
}));

test('a metadata mismatch still discards its unused response, retaining the original entry',()=>fixture(async({state})=>{
  state.response=new globalThis.Response(good);
  assert.equal(await offlineReady(),false);assert.equal(state.bodyCancels,1);assert.equal(state.bodyReads,0);assert.equal(state.puts,0);assert.equal(state.deleted,0);
  assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
}));

test('short-lived receipted preparation retains its original no-read/no-cancel fast path',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(good,{headers:{'X-Handwriting-SHA256':file.sha256}});
  assert.equal((await ensureResources(()=>{},signal)).offline,true);assert.equal(state.bodyCancels,0);assert.equal(state.bodyReads,0);assert.equal(state.fetches,0);assert.equal(state.puts,0);
  assert.deepEqual(new Uint8Array(await state.response.arrayBuffer()),good);
}));

test('a required full receipt check consumes the body instead of discarding it',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(good,{headers:{'X-Handwriting-SHA256':file.sha256}});
  assert.equal((await ensureResources(()=>{},signal,{verifyCached:true})).offline,true);assert.equal(state.bodyReads,1);assert.equal(state.bodyCancels,0);assert.equal(state.fetches,0);assert.equal(state.puts,0);
}));

test('discarding a bad-MIME metadata match does not break later offline repair',()=>fixture(async({state,signal})=>{
  state.response=new globalThis.Response(good,{headers:{'Content-Type':'text/plain','X-Handwriting-SHA256':file.sha256}});
  globalThis.fetch=async()=>{throw Error('Repair must remain offline');};
  assert.equal(await offlineReady(),false);assert.equal(state.bodyCancels,1);
  assert.equal((await ensureResources(()=>{},signal)).offline,true);assert.equal(state.bodyReads,1);assert.equal(state.response.headers.get('Content-Type'),'text/javascript');assert.equal(state.puts,1);assert.equal(await offlineReady(),true);
},scriptFile));

for(const mode of ['throw','reject'])test(`best-effort ${mode} during stream discard cannot change healthy readiness`,()=>fixture(async({state,cache,signal})=>{
  state.response=new globalThis.Response(good,{headers:{'X-Handwriting-SHA256':file.sha256}});const match=cache.match.bind(cache);
  cache.match=async()=>{const hit=await match();hit.body.cancel=()=>{if(mode==='throw')throw Error('Unavailable cleanup');return Promise.reject(Error('Unavailable cleanup'));};return hit;};
  assert.equal(await offlineReady(),true);assert.equal((await ensureResources(()=>{},signal)).offline,true);
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(state.bodyReads,0);assert.equal(state.fetches,0);assert.equal(state.puts,0);
}));

test('discarding a receipted tee branch does not wait for another reader',()=>fixture(async({cache,signal})=>{
  const stream=new globalThis.ReadableStream({pull(controller){controller.enqueue(good);}},{highWaterMark:0}),[owned,other]=stream.tee();let cancels=0;
  cache.match=async()=>{const response=new globalThis.Response(owned,{headers:{'X-Handwriting-SHA256':file.sha256}}),cancel=response.body.cancel.bind(response.body);response.body.cancel=(...args)=>{cancels++;return cancel(...args);};return response;};
  try{assert.equal(await offlineReady(),true);assert.equal(cancels,1);signal.throwIfAborted();}
  finally{await other.cancel();}
}));
