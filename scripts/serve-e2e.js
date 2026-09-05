import {createServer} from "node:http";
import {readFile, stat} from "node:fs/promises";
import {resolve, extname, sep} from "node:path";
import {build} from "vite";
import {startTestBackend} from "../tests/e2e/backend.js";
import {api, origin, webPort} from "../tests/e2e/environment.js";

// Build the real production app/SW, always targeting the isolated API origin.
process.env.VITE_DEFAULT_KV_SERVER = api;
process.env.VITE_ENABLE_ANALYTICS = "false";
const releases = new Map();
for (const release of ["previous", "next"]) {
  const directory = resolve("dist-e2e", release);
  // Both releases use current application code. Only test-only HTML/entry markers
  // differ, producing real asset hashes and Workbox precache revisions for an update.
  await build({mode: "production", build: {outDir: directory}, logLevel: "error", plugins: [{
    name: "e2e-release-marker",
    enforce: "pre",
    transform(source, id) {
      if (id.replaceAll("\\", "/").endsWith("/src/main.js")) {
        return `${source}\ndocument.documentElement.dataset.e2eRelease = ${JSON.stringify(release)};\n`;
      }
    },
    transformIndexHtml() {
      return [{tag: "meta", attrs: {name: "e2e-release", content: release}, injectTo: "head"}];
    },
  }]});
  releases.set(release, directory);
}
if ((await readFile(resolve(releases.get("previous"), "sw.js"), "utf8")) ===
    (await readFile(resolve(releases.get("next"), "sw.js"), "utf8"))) {
  throw new Error("E2E releases must have different service workers");
}
let activeRelease = "previous";
const backend = await startTestBackend();
const mime = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml"};
const frontend = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/__test/release" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const {release} = JSON.parse(raw);
      if (!releases.has(release)) { res.writeHead(400); res.end(); return; }
      activeRelease = release;
      res.writeHead(200, {"Content-Type": "application/json", "Cache-Control": "no-store"});
      res.end(JSON.stringify({release}));
      return;
    }
    const root = releases.get(activeRelease);
    const path = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const file = await stat(path).then((info) => info.isFile() ? path : resolve(root, "index.html")).catch(() => resolve(root, "index.html"));
    res.writeHead(200, {"Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache"});
    res.end(await readFile(file));
  } catch { res.writeHead(500); res.end(); }
});
frontend.listen(webPort, "127.0.0.1", () => console.log(`E2E production PWA ready: ${origin}`));
function close() { frontend.close(); backend.io.close(); backend.server.close(); }
process.on("SIGTERM", close);
process.on("SIGINT", close);
