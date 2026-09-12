import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {api} from "../tests/e2e/environment.js";

// Immutable release commits, not two builds of today's application. Tags may be
// fetched separately, but moving a tag must never silently change this baseline.
const revisions = {
  previous: "6194a954c300165325b897b7d7d56e72880970bd",
  next: "a43899301a6b6b94956a6d209c89f2a8b12a5675",
};
if (!process.env.npm_execpath) throw new Error("Run through pnpm test:upgrade");
const root = resolve("dist-e2e/release-upgrade");
mkdirSync(root, {recursive: true});
const manifest = {};
for (const [release, sha] of Object.entries(revisions)) {
  const source = resolve(root, `${sha}-checkout`);
  execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`]);
  // Git handles Unicode filenames consistently on Windows, unlike system tar.
  if (!existsSync(source)) execFileSync("git", ["worktree", "add", "--detach", source, sha], {stdio: "inherit"});
  const actual = execFileSync("git", ["rev-parse", "HEAD"], {cwd: source, encoding: "utf8"}).trim();
  if (actual !== sha) throw new Error(`Unexpected release checkout: ${actual}`);
  execFileSync("git", ["diff", "--exit-code", "HEAD"], {cwd: source, stdio: "inherit"});
  execFileSync(process.execPath, [process.env.npm_execpath, "install", "--frozen-lockfile", "--ignore-workspace"], {
    cwd: source, stdio: "inherit",
  });
  const env = {...process.env, NODE_ENV: "production", VITE_DEFAULT_KV_SERVER: api, VITE_ENABLE_ANALYTICS: "false"};
  execFileSync(process.execPath, ["scripts/generate-sound-list.js"], {cwd: source, env, stdio: "inherit"});
  const buildScript = `
    import {build} from 'vite';
    await build({logLevel: 'error', plugins: [{name: 'release-proof', transformIndexHtml() {
      return [{tag: 'meta', attrs: {name: 'release-commit', content: '${sha}'}, injectTo: 'head'}];
    }}]});
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", buildScript], {cwd: source, env, stdio: "inherit"});
  const pkg = JSON.parse(readFileSync(resolve(source, "package.json"), "utf8"));
  manifest[release] = {sha, packageVersion: pkg.version, root: resolve(source, "dist")};
}
writeFileSync(resolve(root, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Release upgrade builds:", manifest);
