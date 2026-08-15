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
