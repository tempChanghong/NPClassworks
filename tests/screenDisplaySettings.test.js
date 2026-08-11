import test from "node:test";
import assert from "node:assert/strict";
import {
  SCREEN_DISPLAY_DEFAULTS,
  loadScreenDisplaySettings,
  sanitizeScreenDisplaySettings,
  saveScreenDisplaySettings,
  screenDisplaySettingsKey,
} from "../src/utils/screenDisplaySettings.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("screen display settings are bounded and invalid values use defaults", () => {
  assert.deepEqual(sanitizeScreenDisplaySettings({
    fontScale: 241,
    density: "tiny",
    columns: 2,
    showSecondaryMetadata: false,
  }), {
    fontScale: 200,
    density: "compact",
    columns: "2",
    showSecondaryMetadata: false,
    urgentNoticeSound: true,
    antiBurnInShift: false,
  });
  assert.equal(sanitizeScreenDisplaySettings({fontScale: 94}).fontScale, 90);
});

test("screen display settings persist independently for each binding", () => {
  const storage = memoryStorage();
  saveScreenDisplaySettings("screen-a", {...SCREEN_DISPLAY_DEFAULTS, fontScale: 160}, storage);
  saveScreenDisplaySettings("screen-b", {...SCREEN_DISPLAY_DEFAULTS, columns: "1"}, storage);

  assert.equal(loadScreenDisplaySettings("screen-a", storage).fontScale, 160);
  assert.equal(loadScreenDisplaySettings("screen-b", storage).columns, "1");
  assert.notEqual(screenDisplaySettingsKey("screen-a"), screenDisplaySettingsKey("screen-b"));
});

test("corrupt saved screen display settings fall back safely", () => {
  const storage = memoryStorage();
  storage.setItem(screenDisplaySettingsKey("screen-a"), "not-json");
  assert.deepEqual(loadScreenDisplaySettings("screen-a", storage), SCREEN_DISPLAY_DEFAULTS);
});
