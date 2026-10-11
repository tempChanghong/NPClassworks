import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlowHarness} from './helpers/flowHarness.js';
import {listMicrophoneDevices, testMicrophoneInput} from '../src/utils/microphoneDeviceSettings.js';
import {requestMicrophonePermission} from '../src/utils/microphonePermission.js';
import {saveClassroomToolSettings} from '../src/utils/classroomToolSettings.js';
import {saveNoiseScheduleSettings} from '../src/utils/noiseScheduleSettings.js';

test('retired PWA entry calls never request browser audio or native commands, including old saved settings', async t => {
  const h=await createFlowHarness();t.after(()=>h.close());h.newStore({screen:true});
  let captures=0;
  navigator.mediaDevices={getUserMedia(){captures++;throw new Error('Browser audio must stay disabled');}};
  window.AudioContext=class {constructor(){throw new Error('AudioContext must stay closed');}};
  saveNoiseScheduleSettings('screen-a',{enabled:true,startTime:'00:00',endTime:'23:59'});
  assert.deepEqual(saveClassroomToolSettings('screen-a',{enabledToolIds:['noise','attendance']}).enabledToolIds,['attendance']);
  const {service,native}=await h.retiredNoiseRuntime();
  for(const attempt of [()=>service.start(),()=>service.testMicrophoneDevice(),()=>testMicrophoneInput(),
    ()=>listMicrophoneDevices({requestPermission:true}),()=>requestMicrophonePermission(),
    ()=>native.command('START'),()=>native.protectedStop('password'),()=>native.resumeSchedule()])
    await assert.rejects(attempt(),e=>e.code==='WEB_NOISE_RETIRED');
  await service.stop();assert.equal(captures,0);assert.equal(h.requests.length,0);
});
