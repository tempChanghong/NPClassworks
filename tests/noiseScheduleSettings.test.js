import assert from "node:assert/strict";
import test from "node:test";
import {
  isWithinNoiseSchedule,
  loadNoiseScheduleSettings,
  noiseScheduleWindowKey,
  sanitizeNoiseScheduleSettings,
  saveNoiseScheduleSettings,
} from "../src/utils/noiseScheduleSettings.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("noise schedule defaults to the evening study period", () => {
  assert.deepEqual(sanitizeNoiseScheduleSettings(), {
    enabled: true,
    startTime: "19:15",
    endTime: "21:30",
  });
  const defaults = loadNoiseScheduleSettings("new-screen", memoryStorage());
  assert.equal(isWithinNoiseSchedule(defaults, new Date(2026, 7, 15, 19, 14)), false);
  assert.equal(isWithinNoiseSchedule(defaults, new Date(2026, 7, 15, 19, 15)), true);
  assert.equal(isWithinNoiseSchedule(defaults, new Date(2026, 7, 15, 21, 30)), false);
});

test("noise schedule accepts daytime and overnight windows", () => {
  const evening = {enabled: true, startTime: "19:15", endTime: "21:30"};
  assert.equal(isWithinNoiseSchedule(evening, new Date(2026, 7, 15, 19, 15)), true);
  assert.equal(isWithinNoiseSchedule(evening, new Date(2026, 7, 15, 21, 30)), false);

  const overnight = {enabled: true, startTime: "23:00", endTime: "01:00"};
  assert.equal(isWithinNoiseSchedule(overnight, new Date(2026, 7, 15, 23, 30)), true);
  assert.equal(isWithinNoiseSchedule(overnight, new Date(2026, 7, 16, 0, 30)), true);
  assert.equal(noiseScheduleWindowKey(overnight, new Date(2026, 7, 16, 0, 30)), "2026-08-15:23:00-01:00");
});

test("noise schedule is isolated per classroom screen", () => {
  const storage = memoryStorage();
  saveNoiseScheduleSettings("screen-a", {enabled: false, startTime: "08:00", endTime: "09:00"}, storage);
  assert.deepEqual(loadNoiseScheduleSettings("screen-a", storage), {
    enabled: false,
    startTime: "08:00",
    endTime: "09:00",
  });
  assert.equal(loadNoiseScheduleSettings("screen-b", storage).startTime, "19:15");
});

test("saved old and custom schedules are preserved without writing during reads", () => {
  const storage = memoryStorage();
  const old = {enabled: true, startTime: "19:00", endTime: "21:30"};
  const custom = {enabled: false, startTime: "18:20", endTime: "22:10"};
  saveNoiseScheduleSettings("old-screen", old, storage);
  saveNoiseScheduleSettings("custom-screen", custom, storage);
  storage.setItem = () => { throw new Error("Loading must not rewrite saved schedules"); };
  assert.deepEqual(loadNoiseScheduleSettings("old-screen", storage), old);
  assert.equal(isWithinNoiseSchedule(loadNoiseScheduleSettings("old-screen", storage), new Date(2026, 7, 15, 19, 0)), true);
  assert.deepEqual(loadNoiseScheduleSettings("custom-screen", storage), custom);
  assert.deepEqual(sanitizeNoiseScheduleSettings({startTime: "invalid", endTime: "21:30"}),
    {enabled: true, startTime: "19:15", endTime: "21:30"});
});
