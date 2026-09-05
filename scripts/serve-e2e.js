import {createServer} from "node:http";
import {readFile, stat} from "node:fs/promises";
import {resolve, extname, sep} from "node:path";
import {build} from "vite";
import {startTestBackend} from "../tests/e2e/backend.js";

// Build the real production app/SW, always targeting the isolated API origin.
process.env.VITE_DEFAULT_KV_SERVER = "http://127.0.0.1:4181";
process.env.VITE_ENABLE_ANALYTICS = "false";
const root = resolve("dist-e2e");
await build({mode: "production", build: {outDir: root}, logLevel: "error"});
const backend = await startTestBackend();
const mime = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml"};
const frontend = createServer(async (req, res) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(new URL(req.url, "http://localhost").pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const file = await stat(path).then((info) => info.isFile() ? path : resolve(root, "index.html")).catch(() => resolve(root, "index.html"));
    res.writeHead(200, {"Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache"});
    res.end(await readFile(file));
  } catch { res.writeHead(500); res.end(); }
});
frontend.listen(4180, "127.0.0.1", () => console.log("E2E production PWA ready: http://127.0.0.1:4180"));
function close() { frontend.close(); backend.io.close(); backend.server.close(); }
process.on("SIGTERM", close);
process.on("SIGINT", close);
