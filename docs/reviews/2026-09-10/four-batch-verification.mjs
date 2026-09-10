// Acceptance checks for R1-R4; nonzero exit means a regression.
// Run: node docs/reviews/2026-09-10/four-batch-verification.mjs
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const result = spawnSync(process.execPath, ["--test",
  "tests/publicationPreferenceFailure.test.js", "tests/teacherTargetSync.test.js",
  "tests/teacherTargetPreferences.test.js", "tests/screenQueueReadFlows.test.js",
], {cwd: fileURLToPath(new URL("../../../", import.meta.url)), stdio: "inherit"});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
