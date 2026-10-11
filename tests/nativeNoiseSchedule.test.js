import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeNoiseController} from '../src/utils/nativeNoiseController.js';
const window={start:'2026-10-01T19:00:00.000',end:'2026-10-01T20:00:00.000'};
const policy={source:'Grade',version:'a'.repeat(64),rules:[{days:[4],start:'19:00',end:'20:00'}]};
const native={provider:'native',online:true,status:{configured:true,state:'Stopped'},commands:[],reports:[]};
const schedule={supported:true,online:true,applied:true,policy,status:{version:policy.version,window,reason:'WINDOW_SKIPPED'},commands:[]};
function setup(api) { const c=createNativeNoiseController({screen:async()=>native},()=>{},undefined,api);c.context('one');return c; }
test('0.7 failure never falls back to browser microphone or hides 0.6 native status',async()=>{
  const c=setup({screen:async()=>{throw {response:{status:426}};}});await c.poll();
  assert.equal(c.snapshot().provider,'native');assert.equal(c.snapshot().online,true);assert.match(c.snapshot().scheduleError,/尚未支持/);
});
test('resume response loss keeps request ID, preserves state distinction and awaits evidence',async()=>{
  const calls=[];
  const c=setup({screen:async body=>{if(!body)return globalThis.structuredClone(schedule);calls.push(body);if(calls.length===1)throw new Error('lost');return {};}});
  await c.poll();assert.equal(await c.resumeSchedule(),false);assert.equal(await c.resumeSchedule(),true);
  assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId);assert.deepEqual(calls[0].window,window);
  assert.equal(c.snapshot().schedule.status.reason,'WINDOW_SKIPPED'); // HTTP acceptance is not actual execution.
});
test('late old scope status never becomes a new class status',async()=>{
  let release;const pending=new Promise(r=>{release=r;});
  const c=setup({screen:async()=>{await pending;return schedule;}}),poll=c.poll();
  await new Promise(r=>setTimeout(r,0));c.context('two');release();await poll;
  assert.equal(c.snapshot().schedule,null);assert.equal(c.snapshot().provider,'checking');
});
test('offline and unapplied policy cannot resume automatic monitoring',async()=>{
  let sends=0,value={...schedule,applied:false};
  const c=setup({screen:async body=>{if(body)sends++;return value;}});await c.poll();assert.equal(await c.resumeSchedule(),false);
  value={...schedule,online:false};await c.poll();assert.equal(await c.resumeSchedule(),false);assert.equal(sends,0);
});

test('rejected schedule resume remains visible after status refresh and clears on scope change', async () => {
  const c = setup({screen: async body => {
    if (body) throw {response: {status: 409, data: {error: {code: 'SCHEDULE_VERSION_CONFLICT'}}}};
    return schedule;
  }});
  await c.poll();
  assert.equal(await c.resumeSchedule(), false);
  assert.match(c.snapshot().scheduleError, /SCHEDULE_VERSION_CONFLICT/);
  await c.poll(); assert.match(c.snapshot().scheduleError, /SCHEDULE_VERSION_CONFLICT/);
  c.context('another-screen'); assert.equal(c.snapshot().scheduleError, '');
});
