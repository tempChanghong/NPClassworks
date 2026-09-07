import {createServer} from "node:http";
import {readFile, stat} from "node:fs/promises";
import {resolve, extname, sep} from "node:path";
import {build} from "vite";
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
const root = resolve("dist-e2e/fullstack");
process.env.NODE_ENV = "production";
await build({mode: "production", build: {outDir: root}, logLevel: "error"});
process.env.NODE_ENV = "test";
const backend = createServer(app);
const io = initSocket(backend);
const mime = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml"};
const frontend = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, origin).pathname;
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
