import {spawnSync, execFileSync} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {backendRoot, configureRuntime} from "../tests/fullstack/environment.js";

const managedDatabase = !process.env.FULLSTACK_DATABASE_URL;
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
mkdirSync("test-results/fullstack-metadata", {recursive: true});
const pair = {frontend: version(process.cwd()), backend: version(backendRoot)};
writeFileSync("test-results/fullstack-metadata/versions.json", JSON.stringify(pair, null, 2));
console.log("Fullstack checkout pair:", pair);
try {
  if (managedDatabase) run("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "60"]);
  run(process.execPath, [resolve(backendRoot, "node_modules/prisma/build/index.js"), "migrate", "deploy"], backendRoot);
  // Also execute the recently added persisted single-session regression on this DB.
  process.env.RUN_DATABASE_TESTS = "true";
  run(process.execPath, ["--test", "tests/accountSessionDatabase.integration.test.js"], backendRoot);
  run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.fullstack.config.js"]);
} finally {
  if (managedDatabase) {
    const cleanup = spawnSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], {stdio: "inherit"});
    if (cleanup.status !== 0) process.exitCode = 1;
  }
}
