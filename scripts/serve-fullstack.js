import {createServer} from "node:http";
import {readFile, stat} from "node:fs/promises";
import {resolve, extname, sep} from "node:path";
import {spawnSync} from "node:child_process";
import {api, apiPort, origin, webPort} from "../tests/e2e/environment.js";
import {backendModule, configureRuntime} from "../tests/fullstack/environment.js";

configureRuntime();
const [{default: app}, {initSocket}, {prisma}] = await Promise.all([
  backendModule("app.js"), backendModule("utils/socket.js"), backendModule("utils/prisma.js"),
]);
// Require an empty migrated database rather than resetting any existing records.
if (await prisma.school.count() || await prisma.account.count()) throw new Error("Fullstack database must be empty");
process.env.VITE_DEFAULT_KV_SERVER = api;
process.env.VITE_ENABLE_ANALYTICS = "false";
const upgrade = process.env.FULLSTACK_RELEASE_UPGRADE === "true";
const releases = upgrade ? JSON.parse(await readFile(resolve("dist-e2e/release-upgrade/manifest.json"), "utf8")) : null;
let activeRelease = "previous";
const buildRoot = resolve("dist-e2e/fullstack");
// Prisma's generated client sets global __dirname. Build in a fresh process so
// backend globals cannot alter frontend plugins' package-relative resolution.
const build = upgrade ? {status: 0} : spawnSync(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "build", "--outDir", buildRoot, "--logLevel", "error"], {
  env: {...process.env, NODE_ENV: "production"}, stdio: "inherit",
});
if (build.error || build.status !== 0) throw build.error || new Error(`Fullstack frontend build failed (${build.status})`);
const backend = createServer(app);
const io = initSocket(backend);
const mime = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg"};
const frontend = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, origin).pathname;
    // Local test server only; never included in the production application.
    if (upgrade && pathname === "/__test/release" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const {release} = JSON.parse(raw);
      if (!Object.hasOwn(releases, release)) { res.writeHead(400); res.end(); return; }
      activeRelease = release;
      res.writeHead(200, {"Content-Type": "application/json", "Cache-Control": "no-store"});
      res.end(JSON.stringify(releases[release]));
      return;
    }
    const root = upgrade ? releases[activeRelease].root : buildRoot;
    const path = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const file = await stat(path).then(info => info.isFile() ? path : resolve(root, "index.html"))
      .catch(() => resolve(root, "index.html"));
    res.writeHead(200, {"Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache"});
    res.end(await readFile(file));
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((resolve, reject) => backend.once("error", reject).listen(apiPort, "127.0.0.1", resolve));
await new Promise((resolve, reject) => frontend.once("error", reject).listen(webPort, "127.0.0.1", resolve));
console.log(`Fullstack production PWA ready: ${origin}; real API: ${api}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  frontend.closeAllConnections();
  frontend.close();
  await new Promise(resolve => io.close(resolve));
  backend.closeAllConnections();
  backend.close();
  await prisma.$disconnect();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
