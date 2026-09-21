import {existsSync} from "node:fs";
import {resolve} from "node:path";

export function requireNpepPair(frontend, backend) {
  for (const [root, file] of [[frontend, "tests/fullstack/npep.spec.js"], [frontend, "src/components/admin/NpepDeviceManager.vue"],
    [backend, "routes/v2/npep.js"], [backend, "scripts/npep-config.js"], [backend, "prisma/migrations/20260920120000_npep_n1/migration.sql"]]) {
    if (!existsSync(resolve(root, file))) throw new Error(`N1 checkout is incomplete: ${file}`);
  }
}
export function assertNpepReport(report) {
  const specs = [];
  const visit = suite => { specs.push(...(suite.specs || [])); (suite.suites || []).forEach(visit); };
  (report.suites || []).forEach(visit);
  const tests = specs.filter(spec => /(?:^|[/\\])npep\.spec\.js$/.test(spec.file || "")).flatMap(spec => spec.tests || []);
  if (report.errors?.length || !tests.length || !report.stats || report.stats.skipped !== 0 || report.stats.unexpected !== 0 ||
    report.stats.flaky !== 0 || report.stats.expected < 1 || tests.some(test => test.status !== "expected" ||
      test.expectedStatus !== "passed" || !test.results?.length || test.results.some(result => result.status !== "passed"))) {
    throw new Error("N1 acceptance must execute and pass; empty, skipped or flaky results are not a gate");
  }
}
