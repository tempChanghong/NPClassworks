import {spawnSync, execFileSync} from "node:child_process";
import {mkdirSync, writeFileSync, readFileSync, rmSync} from "node:fs";
import {requireNpepPair, assertNpepReport} from "./npep-acceptance.js";
import {resolve} from "node:path";
import {backendRoot, configureRuntime} from "../tests/fullstack/environment.js";

const managedDatabase = !process.env.FULLSTACK_DATABASE_URL;
const upgrade = process.argv.includes("--upgrade");
const performance = process.argv.includes("--performance");
const npep = process.argv.includes("--npep");
if ([upgrade, performance, npep].filter(Boolean).length > 1) throw new Error("Choose one acceptance suite");
if (npep) {
  if (process.argv.length !== 3) throw new Error("N1 gate does not accept test filters or skip options");
  requireNpepPair(process.cwd(), backendRoot);
  process.env.FULLSTACK_NPEP = "true";
}
if (upgrade) process.env.FULLSTACK_RELEASE_UPGRADE = "true";
const port = Number(process.env.FULLSTACK_POSTGRES_PORT || 55434);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid FULLSTACK_POSTGRES_PORT");
if (managedDatabase) process.env.FULLSTACK_DATABASE_URL = `postgresql://npclassworks_test:fullstack_test_only@127.0.0.1:${port}/npclassworks_test_fullstack`;
configureRuntime();
const compose = ["compose", "--project-name", `npclassworks-fullstack-${process.pid}`, "-f", resolve("tests/fullstack/compose.yml")];
function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, {cwd, env: process.env, stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
const version = cwd => ({
  sha: execFileSync("git", ["rev-parse", "HEAD"], {cwd, encoding: "utf8"}).trim(),
  dirty: Boolean(execFileSync("git", ["status", "--porcelain"], {cwd, encoding: "utf8"}).trim()),
});
const metadata = `test-results/${npep ? "npep" : upgrade ? "upgrade" : performance ? "performance" : "fullstack"}-metadata`;
mkdirSync(metadata, {recursive: true});
const pair = {frontend: version(process.cwd()), backend: version(backendRoot)};
writeFileSync(`${metadata}/versions.json`, JSON.stringify(pair, null, 2));
console.log("Fullstack checkout pair:", pair);
try {
  if (upgrade) run(process.execPath, ["scripts/prepare-release-upgrade.js"]);
  if (managedDatabase) run("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "60"]);
  run(process.execPath, [resolve(backendRoot, "node_modules/prisma/build/index.js"), "migrate", "deploy"], backendRoot);
  // Also execute the recently added persisted single-session regression on this DB.
  process.env.RUN_DATABASE_TESTS = "true";
  run(process.execPath, ["--test", "tests/accountSessionDatabase.integration.test.js"], backendRoot);
  const config = upgrade ? "playwright.upgrade.config.js" : performance ? "playwright.performance.config.js" : "playwright.fullstack.config.js";
  const testArgs = npep ? ["tests/fullstack/npep.spec.js", "--reporter=line,json"] : process.argv.slice(2).filter(arg => !["--upgrade", "--performance"].includes(arg));
  if (npep) {
    process.env.PLAYWRIGHT_JSON_OUTPUT_FILE = resolve(metadata, "results.json");
    rmSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, {force: true});
  }
  run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", config, ...testArgs]);
  if (npep) assertNpepReport(JSON.parse(readFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, "utf8")));
} finally {
  if (managedDatabase) {
    const cleanup = spawnSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], {stdio: "inherit"});
    if (cleanup.status !== 0) process.exitCode = 1;
  }
}
