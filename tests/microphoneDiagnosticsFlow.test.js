import assert from "node:assert/strict";
import test from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

test("picker guides both phases, explains results and cancels stale diagnostics on binding change", async t => {
  const h = await createFlowHarness();
  t.after(() => h.close());
  h.newStore({screen: true});
  navigator.mediaDevices = {enumerateDevices: async () => []};
  const {noiseService} = await h.openNoiseCard();
  const picker = await h.openComponent("/src/components/v2/MicrophoneDevicePicker.vue", {bindingId: "screen-a"});
  const state = picker.state;
  await eventually(() => assert.equal(state.scanning.value, false));
  let options, response;
  noiseService.testMicrophoneDevice = async (_deviceId, opts) => {
    options = opts; response = deferred(); opts.onPhase("quiet"); return response.promise;
  };
  const testing = state.testSelectedDevice(true);
  assert.equal(options.diagnostic, true);
  assert.match(state.statusMessage.value, /保持安静/);
  options.onPhase("speech");
  assert.match(state.statusMessage.value, /正常说话/);
  const result = {state: "working", label: "Conference microphone", dbfs: -35, clippedRatio: 0,
    comparison: {quietDbfs: -40, speechDbfs: -37, changeDb: 3},
    processing: {autoGainControl: true, noiseSuppression: false, echoCancellation: null}};
  response.resolve(result); await testing;
  assert.match(state.processingLabel.value, /自动增益：开启；降噪：关闭；回声消除：未报告/);
  assert.match(state.comparisonHint.value, /差异较小/);
  assert.equal(state.testing.value, false);
  const stale = state.testSelectedDevice(true);
  picker.props.bindingId = "screen-b";
  await nextTick();
  assert.equal(options.signal.aborted, true);
  response.resolve(result); await stale;
  assert.equal(state.diagnosticResult.value, null, "late result must not describe the newly selected screen");
  assert.equal(state.statusMessage.value, "");
});
