import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {chromium} from "@playwright/test";

// Isolated origin and synthetic statistics only; never opens a user's profile.
const source = await readFile(new URL("../src/utils/noiseHistoryStore.js", import.meta.url), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/store.js") {
    res.setHeader("Content-Type", "text/javascript"); res.end(source);
  } else res.end("<!doctype html><title>Noise storage benchmark</title>");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  console.log(JSON.stringify(await page.evaluate(async () => {
    const now = Date.now();
    const history = Array.from({length: 5000}, (_, i) => ({
      id: `fixture-${i}`, start: now - (5000 - i) * 30000, end: now - (4999 - i) * 30000, frames: 300,
      raw: {avgDbfs: -61.12345678, p50Dbfs: -62, segmentCount: 2, sampledDurationMs: 30000,
        coverage: 100, confidence: 100, quality: "good"},
      display: {avgDb: 45.12345678, p95Db: 53.12345678}, score: 85,
      scoreDetail: {coverage: 100, confidence: 100}, model: "relative-activity-v2",
    }));
    const serialized = JSON.stringify(history);
    localStorage.setItem("noise-slices-v2", serialized);
    const timings = [];
    for (let i = 0; i < 45; i++) {
      const start = window.performance.now();
      const existing = JSON.parse(localStorage.getItem("noise-slices-v2") || "[]");
      const retained = [...existing, {...history[0], id: `next-${i}`, end: now}]
        .filter(item => Number.isFinite(item?.end) && now - item.end < 14 * 86400000).slice(-5000);
      localStorage.setItem("noise-slices-v2", JSON.stringify(retained));
      if (i >= 5) timings.push(window.performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    const summary = values => ({medianMs: values[20], p95Ms: values[37], maxMs: values.at(-1)});
    const {createNoiseHistoryStore} = await import("/store.js");
    const store = createNoiseHistoryStore();
    const migrationStart = window.performance.now();
    await store.read();
    const migrationMs = window.performance.now() - migrationStart;
    const incremental = [];
    for (let i = 0; i < 45; i++) {
      const start = window.performance.now();
      await store.append({...history[0], id: `incremental-${i}`, end: now + i});
      if (i >= 5) incremental.push(window.performance.now() - start);
    }
    incremental.sort((a, b) => a - b);
    await store.close();
    return {records: history.length, serializedCharacters: serialized.length, samples: timings.length,
      legacySynchronous: summary(timings), indexedDBCompletion: summary(incremental), migrationMs};
  }), null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
