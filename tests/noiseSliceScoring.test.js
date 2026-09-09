import assert from "node:assert/strict";
import test from "node:test";
import {createFlowHarness} from "./helpers/flowHarness.js";
import {analyzeNoiseWindow} from "../src/utils/noiseScoring.js";
import {summarizeNoiseHistoryByDay} from "../src/utils/noiseHistorySummary.js";

test("noise history scores belong to each recorded interval regardless of live-analysis timing", async t => {
  const h = await createFlowHarness();
  const card = await h.openNoiseCard();
  const service = card.noiseService;
  const originalStore = service.historyStore;
  const rows = [];
  service.historyStore = {append: async slice => rows.push(slice), read: async () => rows, clear: async () => { rows.length = 0; }};
  let now = new Date("2026-09-09T10:00:00+08:00").getTime();
  t.mock.method(Date, "now", () => now);
  t.after(async () => {
    await service.stop();
    service.historyStore = originalStore;
    card.unmount();
    await h.close();
  });

  for (const noisyFirst of [true, false]) for (const analysisOffset of [0, 200]) {
    await t.test(`${noisyFirst ? "noisy then quiet" : "quiet then noisy"}, analysis offset ${analysisOffset}ms`, async () => {
      await service.stop(); rows.length = 0;
      const start = now + 1000;
      Object.assign(service, {status: "active", sliceStart: start, lastAnalysisAt: start + analysisOffset,
        windowFrames: [], sliceFrames: [], ringBuffer: []});
      const frames = [];
      for (let i = 1; i <= 750; i++) {
        now = start + i * 100;
        const noisy = i <= 300 ? noisyFirst : i <= 600 ? !noisyFirst : false;
        const dbfs = noisy && Math.floor((i - 1) / 10) % 2 === 0 ? -25 : -60;
        const rms = 10 ** (dbfs / 20);
        frames.push({dbfs: 20 * Math.log10(rms)});
        service.consumeFeature({rms, peak: rms});
        if (i === 600 && analysisOffset === 0) {
          assert.equal(service.currentScore, analyzeNoiseWindow(frames).score, "live scoring keeps the 60-second window");
        }
      }
      await service.stop(); await service.historyWrite;
      assert.equal(rows.length, 3);
      const expected = [[0, 300, 30000], [300, 600, 30000], [600, 750, 15000]].map(([from, to, windowMs]) =>
        analyzeNoiseWindow(frames.slice(from, to), {windowMs}));
      rows.forEach((slice, index) => {
        assert.equal(slice.end - slice.start, index === 2 ? 15000 : 30000);
        assert.equal(slice.frames, index === 2 ? 150 : 300);
        assert.equal(slice.score, expected[index].score);
        assert.equal(slice.raw.segmentCount, expected[index].eventCount);
        assert.equal(slice.raw.coverage, 100);
        assert.equal(slice.raw.quality, "good");
      });
      const quiet = rows[noisyFirst ? 1 : 0];
      assert.equal(quiet.score, 100);
      assert.equal(quiet.raw.segmentCount, 0);
      assert.equal(rows[noisyFirst ? 0 : 1].raw.segmentCount, 15);
      assert.equal(rows[2].score, 100);
      assert.equal(summarizeNoiseHistoryByDay(rows)[0].averageScore,
        Math.round(expected.reduce((sum, item) => sum + item.score, 0) / 3));
    });
  }

  await t.test("missing samples still reduce coverage within the recorded interval", async () => {
    await service.stop(); rows.length = 0;
    const start = now + 1000;
    Object.assign(service, {status: "active", sliceStart: start, lastAnalysisAt: start,
      windowFrames: [], sliceFrames: [], ringBuffer: []});
    for (let i = 1; i <= 150; i++) {
      now = start + i * 200;
      service.consumeFeature({rms: 0.001, peak: 0.001});
    }
    await service.stop(); await service.historyWrite;
    assert.equal(rows[0].raw.coverage, 50);
    assert.equal(rows[0].raw.quality, "low-coverage");
  });
});
