import assert from "node:assert/strict";
import test from "node:test";
import {analyzeNoiseWindow, estimatedDbFromRms} from "../src/utils/noiseScoring.js";

function frames(count, dbfs, overrides = {}) {
  return Array.from({length: count}, (_, index) => ({
    timestamp: index * 100,
    dbfs,
    clippedRatio: 0,
    zeroRatio: 0.1,
    ...overrides,
  }));
}

test("relative noise scoring rewards stable quiet windows", () => {
  const quiet = analyzeNoiseWindow(frames(600, -62));
  const noisy = analyzeNoiseWindow([
    ...frames(300, -62),
    ...frames(300, -38),
  ]);
  assert.ok(quiet.score > noisy.score);
  assert.equal(quiet.coverage, 100);
  assert.equal(quiet.quality, "good");
});

test("noise scoring reports clipping and incomplete coverage", () => {
  const clipping = analyzeNoiseWindow(frames(600, -20, {clippedRatio: 0.05}));
  const partial = analyzeNoiseWindow(frames(120, -55));
  assert.equal(clipping.quality, "clipping");
  assert.equal(partial.quality, "low-coverage");
  assert.equal(partial.coverage, 20);
});

test("estimated display level follows the saved calibration point", () => {
  assert.equal(estimatedDbFromRms(0.001, 0.001, 40), 40);
  assert.equal(Math.round(estimatedDbFromRms(0.01, 0.001, 40)), 60);
});
