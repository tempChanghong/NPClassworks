import assert from "node:assert/strict";
import test from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred} from "./helpers/flowHarness.js";
import {saveNoiseScheduleSettings} from "../src/utils/noiseScheduleSettings.js";
import {saveClassroomToolSettings} from "../src/utils/classroomToolSettings.js";

test("schedule cancellation remains responsive while microphone permission is pending", async t => {
  t.mock.timers.enable({apis: ["Date"], now: new Date("2026-09-06T12:00:00+08:00")});
  const harness = await createFlowHarness();
  t.after(() => harness.close());
  let pending;
  window.AudioContext = class {close() { return Promise.resolve(); }};
  navigator.mediaDevices = {getUserMedia() { pending = deferred(); return pending.promise; }};
  for (const operation of ["disable-schedule", "disable-tool", "unbind", "switch-binding", "unmount"]) {
    await t.test(operation, async () => {
      harness.reset();
      const store = harness.newStore({screen: true});
      saveNoiseScheduleSettings("screen-a", {enabled: true, startTime: "00:00", endTime: "23:59"});
      const manager = await harness.openNoiseScheduler();
      assert.equal(manager.noiseService.status, "initializing");
      const startingGeneration = manager.noiseService.generation;
      const permission = pending;
      if (operation === "disable-schedule") saveNoiseScheduleSettings("screen-a", {enabled: false});
      if (operation === "disable-tool") saveClassroomToolSettings("screen-a", {enabledToolIds: ["attendance"]});
      if (operation === "unbind") store.screenSession = null;
      if (operation === "switch-binding") {
        saveNoiseScheduleSettings("screen-b", {enabled: false});
        store.screenSession = {binding: {id: "screen-b"}};
      }
      if (operation === "unmount") manager.unmount();
      await nextTick();
      assert.ok(manager.noiseService.generation > startingGeneration);
      assert.equal(manager.noiseService.status, "paused");
      const track = {stopped: false, stop() { this.stopped = true; }};
      permission.resolve({getTracks: () => [track]});
      await Promise.resolve(); await Promise.resolve();
      assert.equal(track.stopped, true);
      assert.equal(manager.noiseService.status, "paused");
      if (operation !== "unmount") manager.unmount();
    });
  }
});
