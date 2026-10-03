import {readFile, stat} from "node:fs/promises";
import path from "node:path";

const dist = path.resolve(process.argv[2] || "dist");
const worker = await readFile(path.join(dist, "sw.js"), "utf8");
const start = worker.indexOf("precacheAndRoute(["), end = worker.indexOf("],", start);
if (start < 0 || end < start) throw new Error("Workbox precache manifest was not found");

const urls = [...worker.slice(start, end).matchAll(/url:"([^"]+)"/g)].map(match => match[1]);
if (!urls.length) throw new Error("Workbox precache manifest is empty");
const files = [];
for (const url of new Set(urls)) {
  const normalized = url.replace(/^\.\//, "").split("?")[0];
  const filename = path.resolve(dist, normalized);
  if (!filename.startsWith(dist + path.sep)) throw new Error(`Invalid precache URL: ${url}`);
  files.push({url, bytes: (await stat(filename)).size});
}
files.sort((a, b) => b.bytes - a.bytes);
const totalUniqueBytes = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(JSON.stringify({entries: urls.length, uniqueFiles: files.length, totalUniqueBytes,
  largest: files.slice(0, 12)}, null, 2));
