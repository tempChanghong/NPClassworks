// Retired browser capture entry. Historical acquisition regression is retained; current guards are tested in webNoiseRetirement.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlowHarness} from './helpers/flowHarness.js';

test.skip('the actual browser noise card withdraws stale readings and confidence without stopping ownership',async t=>{
  const h=await createFlowHarness(); h.newStore({screen:true});
  window.AudioContext=class {
    constructor(){this.state='running';this.audioWorklet={addModule:async()=>{}};}
    createMediaStreamSource(){return {connect(){}};}
    createBiquadFilter(){return {frequency:{},connect(){}};}
    createGain(){return {gain:{},connect(){}};}
    async close(){this.state='closed';}
  };
  window.AudioWorkletNode=class {constructor(){this.port={};}connect(){}}; window.isSecureContext=true;
  navigator.mediaDevices={getUserMedia:async()=>{
    const track=Object.assign(new globalThis.EventTarget(),{stop(){},getSettings:()=>({deviceId:'fake'})});
    return {getTracks:()=>[track],getAudioTracks:()=>[track]};
  }};
  const card=await h.openNoiseCard(), service=card.noiseService;
  const descriptor=Object.getOwnPropertyDescriptor(globalThis.performance,'now');
  const originalNow=Date.now; let tick=100;
  Object.defineProperty(globalThis.performance,'now',{configurable:true,value:()=>tick});
  t.after(async()=>{
    await service.stop(); await service.historyWrite;
    if(descriptor)Object.defineProperty(globalThis.performance,'now',descriptor);else delete globalThis.performance.now;
    Date.now=originalNow; card.unmount(); await h.close();
  });
  service.historyStore={append:async()=>{},read:async()=>[]};
  await service.start();
  const feed=()=>service.processorNode.port.onmessage({data:{rms:.01,peak:.02}});
  for(let i=0;i<601;i++){tick+=100;feed();}
  assert.equal(card.state.statusLabel,'监测中'); assert.match(card.state.signalQualityLabel(),/信号正常/);
  const wall=originalNow(); Date.now=()=>wall-3600000; tick+=1100;
  for(const listener of service.listeners)listener(service.snapshot());
  assert.equal(card.state.statusLabel,'等待新采样'); assert.equal(card.state.currentDb,'--');
  assert.equal(card.state.signalQualityLabel(),'暂无新采样'); assert.equal(card.state.currentScore,null);
  assert.equal(service.status,'active'); // A schedule/manual owner is still responsible for stopping.
  tick+=100;feed(); assert.ok(service.snapshot().signalHealth.coverage<80);
});
