import test from "node:test";
import assert from "node:assert/strict";
import {summarizeNoiseHistoryByDay} from "../src/utils/noiseHistorySummary.js";

test("noise history is grouped by local day with stable summaries", () => {
  const first = new Date(2026, 7, 16, 19, 15, 0).getTime();
  const previous = new Date(2026, 7, 15, 20, 0, 0).getTime();
  const groups = summarizeNoiseHistoryByDay([
    {id: "a", start: first, end: first + 30_000, score: 80, display: {avgDb: 50, p95Db: 64}},
    {id: "b", start: first + 30_000, end: first + 60_000, score: 90, display: {avgDb: 54, p95Db: 70}},
    {id: "c", start: previous, end: previous + 30_000, score: 70, display: {avgDb: 60, p95Db: 75}},
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    dateKey: "2026-08-16",
    slices: [
      {id: "b", start: first + 30_000, end: first + 60_000, score: 90, display: {avgDb: 54, p95Db: 70}},
      {id: "a", start: first, end: first + 30_000, score: 80, display: {avgDb: 50, p95Db: 64}},
    ],
    count: 2,
    durationMinutes: 1,
    averageScore: 85,
    averageDb: 52,
    peakP95: 70,
  });
});

test("invalid history slices are ignored and missing metrics stay empty", () => {
  const start = new Date(2026, 7, 16, 8, 0, 0).getTime();
  const groups = summarizeNoiseHistoryByDay([
    null,
    {start, end: start},
    {id: "valid", start, end: start + 30_000, score: null, display: {}},
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].averageScore, null);
  assert.equal(groups[0].averageDb, null);
  assert.equal(groups[0].peakP95, null);
});
