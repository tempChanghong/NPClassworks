import test from 'node:test';import assert from 'node:assert/strict';import {LineResultCache} from '../../src/features/handwriting/line-result-cache.js';
const bounds=[0,1,2].map(row=>({row,x:1,y:row*160,width:500,height:120}));
const row=(id,text='第12—15页')=>({row:id,text,modelText:text,candidates:[text],modelMs:100,decodeMs:2});
test('unchanged rows retain text but report zero new inference',()=>{
  const c=new LineResultCache(),versions=[1,1,1];c.finish(c.plan(bounds,versions),bounds.map(b=>row(b.row)));
  const plan=c.plan(bounds,versions);assert.equal(plan.missing.length,0);const result=c.finish(plan,[]);assert.equal(result.length,3);assert.ok(result.every(l=>l.reused&&l.modelMs===0&&l.decodeMs===0));
});
test('a new stroke in the same bounds still invalidates that row',()=>{
  const c=new LineResultCache();c.finish(c.plan(bounds,[1,1,1]),bounds.map(b=>row(b.row)));
  const plan=c.plan(bounds,[1,2,1]);assert.deepEqual(plan.missing,[bounds[1]]);const result=c.finish(plan,[row(1,'第16—18页')]);assert.equal(result[0].text,'第12—15页');assert.equal(result[1].text,'第16—18页');assert.equal(result[2].text,'第12—15页');assert.deepEqual(result.map(r=>r.reused),[true,false,true]);
  assert.equal(result[1].modelMs,100);
});
test('clear, undo repaint and scope reset make every row fresh',()=>{
  const c=new LineResultCache();c.finish(c.plan(bounds,[1,1,1]),bounds.map(b=>row(b.row)));const old=c.plan(bounds,[1,1,1]);c.reset();assert.equal(c.plan(bounds,[1,1,1]).missing.length,3);assert.throws(()=>c.finish(old,[]),/变化/);
});
test('incomplete, duplicated or foreign row responses cannot partially fill cache',()=>{
  for(const bad of [[row(0)],[row(0),row(0),row(2)],[row(0),row(1),row(9)]]){const c=new LineResultCache(),plan=c.plan(bounds,[1,1,1]);assert.throws(()=>c.finish(plan,bad),/不完整/);assert.equal(c.entries.size,0);}
});
test('removed rows are evicted and storage is bounded at three text rows',()=>{
  const c=new LineResultCache();c.finish(c.plan(bounds,[1,1,1]),bounds.map(b=>row(b.row)));c.finish(c.plan([bounds[0]],[1,1,1]),[]);assert.equal(c.entries.size,1);assert.throws(()=>c.plan([...bounds,bounds[0]],[1,1,1]),/无效/);
});
test('cache excludes all image, tensor and review payloads',()=>{
  const c=new LineResultCache(),value={...row(0),data:new Float32Array(100000),image:new Uint8Array(100000),review:[{image:new Uint8Array(100000)}]};c.finish(c.plan([bounds[0]],[1,1,1]),[value]);const entry=c.entries.get(0).line;assert.deepEqual(Object.keys(entry).sort(),['candidates','modelText','row','text']);value.candidates.push('别的');assert.equal(entry.candidates.length,1);
});
