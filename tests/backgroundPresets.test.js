import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const presets = JSON.parse(readFileSync(new URL("../src/utils/backgroundPresets.json", import.meta.url)));
test("preset catalog references versioned WebP assets with bounded display size and download footprint", () => {
  assert.equal(presets.length, 10);
  assert.equal(new Set(presets.map(p => p.id)).size, presets.length);
  assert.deepEqual([...new Set(presets.map(p => p.category))].sort(), ["光谱", "原神", "教师节"]);
  let bytes = 0;
  for (const preset of presets) {
    const image = readFileSync(new URL(`../public/${preset.image}`, import.meta.url));
    const thumbnail = readFileSync(new URL(`../public/${preset.thumbnail}`, import.meta.url));
    assert.equal(image.subarray(8, 12).toString(), "WEBP");
    assert.equal(image.length, preset.bytes);
    assert.ok(preset.image.includes(createHash("sha256").update(image).digest("hex").slice(0, 12)));
    assert.ok(Math.max(preset.width, preset.height) <= 3840);
    assert.ok(thumbnail.length < 80000);
    bytes += image.length;
  }
  assert.ok(bytes < 12 * 1024 * 1024);
});
