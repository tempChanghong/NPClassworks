import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASSROOM_TOOL_IDS,
  classroomToolSettingsKey,
  loadClassroomToolSettings,
  sanitizeClassroomToolSettings,
  saveClassroomToolSettings,
} from "../src/utils/classroomToolSettings.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("classroom tool settings keep only known tools in stable order", () => {
  assert.deepEqual(sanitizeClassroomToolSettings({
    enabledToolIds: ["exam", "unknown", "attendance"],
  }).enabledToolIds, ["attendance"]);
});

test("classroom tool settings persist independently for each screen", () => {
  const storage = memoryStorage();
  saveClassroomToolSettings("a", {enabledToolIds: ["attendance", "noise"]}, storage);
  saveClassroomToolSettings("b", {enabledToolIds: ["random"]}, storage);
  assert.deepEqual(loadClassroomToolSettings("a", storage).enabledToolIds, ["attendance", "noise"]);
  assert.deepEqual(loadClassroomToolSettings("b", storage).enabledToolIds, []);
  assert.notEqual(classroomToolSettingsKey("a"), classroomToolSettingsKey("b"));
  assert.deepEqual(loadClassroomToolSettings("missing", storage).enabledToolIds, CLASSROOM_TOOL_IDS);
});
