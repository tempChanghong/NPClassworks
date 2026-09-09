import assert from "node:assert/strict";
import test from "node:test";
import {createFlowHarness, deferred} from "./helpers/flowHarness.js";
import {saveNoiseScheduleSettings} from "../src/utils/noiseScheduleSettings.js";
import {MANUAL_NOISE_LIMIT_MS} from "../src/utils/noiseMonitoringController.js";
import {saveClassroomToolSettings} from "../src/utils/classroomToolSettings.js";

test("a manual permission response after three hours cannot reactivate the microphone", async t => {
  t.mock.timers.enable({apis: ["Date"], now: new Date("2026-09-09T08:00:00+08:00")});
  const h = await createFlowHarness();
  t.after(() => h.close());
  h.newStore({screen: true});
  saveNoiseScheduleSettings("screen-a", {enabled: false});
  const permission = deferred();
  window.AudioContext = class {close() { return Promise.resolve(); }};
  navigator.mediaDevices = {getUserMedia: () => permission.promise};
  const manager = await h.openNoiseScheduler();
  const card = await h.openNoiseCard();
  await card.state.startMonitoring();
  assert.equal(manager.noiseService.status, "initializing");
  card.unmount();
  assert.equal(manager.noiseService.status, "initializing", "leaving the view must not cancel manual startup");
  t.mock.timers.tick(MANUAL_NOISE_LIMIT_MS);
  const track = {stopped: false, stop() { this.stopped = true; }};
  permission.resolve({getTracks: () => [track]});
  await permission.promise; await Promise.resolve(); await Promise.resolve();
  assert.equal(track.stopped, true);
  assert.equal(manager.noiseService.status, "paused");
  manager.unmount();
});

for (const operation of ["disable-tool", "change-credentials", "temporary-exit"]) {
  test(`manual startup is cancelled by ${operation}, including a late permission response`, async t => {
    const h = await createFlowHarness();
    t.after(() => h.close());
    const store = h.newStore({screen: true});
    h.screenExit.refreshScreenExitState();
    saveNoiseScheduleSettings("screen-a", {enabled: false});
    const permission = deferred();
    window.AudioContext = class {close() { return Promise.resolve(); }};
    navigator.mediaDevices = {getUserMedia: () => permission.promise};
    const manager = await h.openNoiseScheduler();
    const card = await h.openNoiseCard();
    await card.state.startMonitoring();
    assert.equal(manager.noiseService.status, "initializing");
    if (operation === "disable-tool") saveClassroomToolSettings("screen-a", {enabledToolIds: ["attendance"]});
    if (operation === "change-credentials") store.screenSession.binding.credentialVersion = 2;
    if (operation === "temporary-exit") h.unlockScreen();
    assert.equal(manager.noiseService.status, "paused");
    const track = {stopped: false, stop() { this.stopped = true; }};
    permission.resolve({getTracks: () => [track]});
    await permission.promise; await Promise.resolve(); await Promise.resolve();
    assert.equal(track.stopped, true);
    assert.equal(manager.noiseService.status, "paused");
    card.unmount(); manager.unmount();
  });
}
