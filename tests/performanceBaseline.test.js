import assert from "node:assert/strict";
import test from "node:test";
import {appendPerformanceSample, summarizeNavigationTiming} from "../src/utils/performanceBaseline.js";

test("导航性能摘要转换为稳定的毫秒与字节字段", () => {
  assert.deepEqual(summarizeNavigationTiming({
    startTime: 5,
    responseStart: 47.4,
    domContentLoadedEventEnd: 210.6,
    loadEventEnd: 330.2,
    transferSize: 1024,
    encodedBodySize: 768,
  }), {
    ttfbMs: 42,
    domContentLoadedMs: 206,
    loadMs: 325,
    transferBytes: 1024,
    encodedBytes: 768,
  });
});

test("性能样本只保留最近的数据", () => {
  const result = appendPerformanceSample([{id: 1}, {id: 2}], {id: 3}, 2);
  assert.deepEqual(result, [{id: 2}, {id: 3}]);
});
