import {test} from "node:test";
import assert from "node:assert/strict";
import {assertNpepReport, requireNpepPair} from "../scripts/npep-acceptance.js";

const report = () => ({stats: {expected: 1, skipped: 0, unexpected: 0, flaky: 0}, errors: [], suites: [{specs: [{file: "npep.spec.js", tests: [{status: "expected", expectedStatus: "passed", results: [{status: "passed"}]}]}]}]});
test("N1 gate requires an executed successful scenario, rejecting skipped, empty, flaky and expected failures", () => {
  assert.doesNotThrow(() => assertNpepReport(report()));
  for (const modify of [r => { r.suites = []; }, r => { r.stats.skipped = 1; }, r => { r.stats.flaky = 1; },
    r => { r.errors = [{}]; }, r => { r.suites[0].specs[0].tests[0].results = []; },
    r => { r.suites[0].specs[0].tests[0].expectedStatus = "failed"; },
    r => { r.suites[0].specs[0].tests[0].results[0].status = "skipped"; }]) {
    const value = report(); modify(value); assert.throws(() => assertNpepReport(value), /must execute/);
  }
  assert.throws(() => requireNpepPair("missing-npep-frontend", "missing-npep-backend"), /incomplete/);
});
