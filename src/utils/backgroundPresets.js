import presets from "./backgroundPresets.json";

export const backgroundPresets = presets;
export const BACKGROUND_CACHE = "classworks-backgrounds-v1";
export const findBackgroundPreset = id => presets.find(preset => preset.id === id);
export const backgroundAssetUrl = path => `${import.meta.env.BASE_URL}${path}`;
let recentImage;

function assertActive(signal) {
  if (signal?.aborted) throw new Error("背景下载已取消");
}

function decodeBackground(image, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) { image.src = ""; reject(error); } else resolve();
    };
    const abort = () => finish(new Error("背景下载已取消"));
    const timer = setTimeout(() => finish(new Error("背景图片解码超时，请重试")), 5000);
    signal?.addEventListener("abort", abort, {once: true});
    if (signal?.aborted) { abort(); return; }
    Promise.resolve().then(() => image.decode()).then(() => finish(), finish);
  });
}

// Only preset images enter this cache; remote URLs keep the existing browser behavior.
export async function loadPresetBackground(preset, {signal} = {}) {
  assertActive(signal);
  const url = new URL(backgroundAssetUrl(preset.image), window.location.href).href;
  let cache;
  try { cache = await caches.open(BACKGROUND_CACHE); } catch { /* Private mode/quota: network still works. */ }
  let response;
  try { response = await cache?.match(url); } catch { cache = null; }
  assertActive(signal);
  let cached = Boolean(response), fallback = false;
  let blob;
  if (!response && recentImage?.url === url) response = new window.Response(recentImage.blob);
  if (!response) {
    const controller = new window.AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, {once: true});
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      response = await fetch(url, {signal: controller.signal});
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("image/")) throw new Error("背景图片下载失败");
      // fetch resolves at the headers; keep the deadline until all image bytes arrive.
      blob = await response.blob();
    } catch (error) {
      assertActive(signal);
      // A PWA upgrade may change an asset hash while offline. Keep the last
      // downloaded version of this same preset available until the network recovers.
      const previous = (await cache?.keys() || []).find(key => new URL(key.url).pathname.split("/").pop().startsWith(`${preset.id}-`));
      if (!previous) throw controller.signal.aborted ? new Error("背景图片下载超时，请重试") : error;
      response = await cache.match(previous);
      cached = true; fallback = true;
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  blob ??= await response.blob();
  assertActive(signal);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new window.Image(); image.src = objectUrl;
    await decodeBackground(image, signal);
    assertActive(signal);
    recentImage = fallback ? null : {url, blob};
    try {
      if (cache && !cached && !fallback) {
        await cache.put(url, new window.Response(blob, {headers: {"Content-Type": blob.type}}));
        cached = true;
      }
    } catch { /* Do not evict the working background just to fit a new one. */ }
    assertActive(signal);
    return {objectUrl, cached};
  } catch (error) { URL.revokeObjectURL(objectUrl); throw error; }
}

export async function pruneBackgroundCache(selectedId) {
  try {
    const cache = await caches.open(BACKGROUND_CACHE);
    const keys = await cache.keys();
    const selected = findBackgroundPreset(selectedId);
    const protectedKey = keys.find(key => selected && key.url.endsWith(selected.image))
      || keys.find(key => new URL(key.url).pathname.split("/").pop().startsWith(`${selectedId}-`));
    const others = keys.filter(key => key !== protectedKey);
    // Keep the selection and at most two previously downloaded backgrounds.
    for (const key of others.slice(0, Math.max(0, keys.length - 3))) await cache.delete(key);
  } catch { /* Cache cleanup must never change saved settings or offline homework. */ }
}
