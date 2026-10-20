import pins from "./resource-pins.js";
export const cacheName = pins.cache;
export const resourceBytes = pins.files.reduce((n, f) => n + f.bytes, 0);
// WHATWG JavaScript MIME essences. Only fixed, SHA-pinned module resources are
// eligible for repair; arbitrary downloads never become executable scripts.
const scriptMimes = new Set([
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
  'text/x-ecmascript', 'text/x-javascript',
]);
function needsScriptMimeRepair(file, headers) {
  if (!/\.m?js$/.test(file.path)) return false;
  const essence = (headers.get('Content-Type') || '').split(';', 1)[0].replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, '').toLowerCase();
  return !scriptMimes.has(essence);
}
async function verifiedHash(bytes, file) {
  if (bytes.byteLength !== file.bytes) return null;
  const sha = [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
  return sha === file.sha256 ? sha : null;
}
async function readPinnedBody(response, file, signal) {
  signal.throwIfAborted();
  const reader = response.body?.getReader();
  if (!reader) return null;
  let ended = false;
  // Cache Storage can return a tee branch. Its cancel promise may wait for an
  // unrelated reader, so request cancellation without delaying this operation.
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, {once: true});
  try {
    // A slow/empty response or an oversized first chunk must not reserve a
    // full model-sized buffer before there are any valid bytes to copy.
    let bytes, offset = 0;
    for (;;) {
      signal.throwIfAborted();
      const {done, value} = await reader.read();
      signal.throwIfAborted();
      if (done) { ended = true; return bytes && offset === file.bytes ? bytes.buffer : null; }
      // Bound actual decoded bytes, not Content-Length (which may describe a
      // compressed transfer). No oversized response is buffered in its entirety.
      if (!(value instanceof Uint8Array) || value.byteLength > file.bytes - offset) return null;
      if (!value.byteLength) continue;
      bytes ||= new Uint8Array(file.bytes);
      bytes.set(value, offset); offset += value.byteLength;
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!ended) cancel();
    reader.releaseLock();
  }
}
function discardUnreadBody(response) {
  // Header-only checks do not own the cached bytes. Close just this returned
  // stream; a later match still reads the original stored resource. Do not
  // wait for a tee sibling, or let cleanup failure change metadata readiness.
  try { void response?.body?.cancel().catch(() => {}); } catch { /* Best effort. */ }
}
export async function offlineReady() {
  try {
    const cache = await caches.open(cacheName);
    for (const file of pins.files) {
      const hit = await cache.match(file.path);
      try { if (!hit?.ok || hit.headers.get("X-Handwriting-SHA256") !== file.sha256 || needsScriptMimeRepair(file, hit.headers)) return false; }
      finally { discardUnreadBody(hit); }
    }
    return true;
  } catch { return false; }
}
export async function ensureResources(progress, signal, {verifyCached = false} = {}) {
  let cache;
  try { cache = await caches.open(cacheName); } catch { /* Online OCR remains possible. */ }
  let completed = 0, warning = "";
  for (const file of pins.files) {
    signal.throwIfAborted();
    let hit;
    try { hit = cache && await cache.match(file.path); }
    catch { cache = null; warning = "无法读取离线缓存，本次可在线识别。"; }
    const receipt = hit?.headers.get("X-Handwriting-SHA256");
    const badMime = hit && needsScriptMimeRepair(file, hit.headers);
    // Matching bytes/receipt do not make an HTTP error response importable.
    // Keep status repair mandatory only while that unusable entry remains.
    let badStatus = hit && !hit.ok;
    if (verifyCached || receipt !== file.sha256 || badMime || badStatus) {
      progress(`${verifyCached ? "正在复核识别资源" : "首次准备识别资源"} ${completed}/${pins.files.length}…`);
      let bytes, headers, sha, validReceiptedHit = false;
      try {
        if (hit) {
          try { bytes = await readPinnedBody(hit, file, signal); } catch { /* An unreadable entry is replaced below. */ }
          signal.throwIfAborted();
          sha = bytes && await verifiedHash(bytes, file);
          signal.throwIfAborted();
          if (sha) { headers = hit.headers; validReceiptedHit = receipt === sha && !badMime && !badStatus; }
          else {
            bytes?.transfer?.(0); bytes = null;
            // Remove the known bad fixed entry before replacement. Ordinary
            // compute requests must not reuse it if the replacement fails.
            try { await cache.delete(file.path); badStatus = false; }
            catch { throw Error("无法更新已损坏的识别缓存，请保留笔迹后重试。"); }
          }
        }
        if (!bytes) {
          let response;
          // The matching production SW route is NetworkOnly. Its asynchronous raw
          // cache write must not overwrite the validated response written here.
          try { response = await fetch(file.path, {signal, cache: "no-cache", headers: {'X-Handwriting-Prepare': '1'}}); }
          catch (error) { if (signal.aborted) throw error; throw Error("识别资源尚未准备完整，请联网后重试。笔迹保留。"); }
          if (!response.ok) throw Error("识别资源暂不可用，笔迹保留，请联网后重试。");
          bytes = await readPinnedBody(response, file, signal); headers = response.headers;
          sha = bytes && await verifiedHash(bytes, file);
        }
        signal.throwIfAborted();
        if (!sha) throw Error("识别资源校验失败，未使用不匹配的模型。笔迹保留。");
        const repairMime = needsScriptMimeRepair(file, headers);
        if ((repairMime || badStatus) && !cache) throw Error("修复后的识别组件无法保存，请恢复浏览器存储后重试。笔迹保留。");
        if (cache) {
          if (!validReceiptedHit) try {
            const verifiedHeaders = new globalThis.Headers(headers); verifiedHeaders.set("X-Handwriting-SHA256", sha);
            if (repairMime) verifiedHeaders.set('Content-Type', 'text/javascript');
            await cache.put(file.path, new globalThis.Response(bytes, {headers: verifiedHeaders}));
          } catch {
            if (repairMime || badStatus) throw Error("修复后的识别组件无法保存，请恢复浏览器存储后重试。笔迹保留。");
            warning = "离线缓存未能完整保存，本次可在线识别。"; cache = null;
          }
        }
        else warning = "浏览器未允许离线缓存，本次可在线识别。";
      } finally {
        // Do not leave preparation buffers in the page's GC queue
        // while WASM loads. Older engines still use normal garbage collection.
        bytes?.transfer?.(0);
      }
    }
    completed++;
  }
  signal.throwIfAborted();
  // Every entry was already checked or durably written above. A second sweep
  // repeats 19 Cache Storage IPC calls without making the snapshot atomic.
  return {offline: Boolean(cache), warning};
}
