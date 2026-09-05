const SESSION_KEY = "classworks-v2-screen-session-cache";
const FEED_PREFIX = "classworks-v2-screen-feed-cache:";
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FEED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
export const SCREEN_FEED_CACHE_MAX_ENTRIES = 30;
// Approximate UTF-16 storage cost, not the browser's total quota. Leave room for drafts/queues.
export const SCREEN_FEED_CACHE_MAX_BYTES = 1024 * 1024;

const storedBytes = (key, raw) => (key.length + raw.length) * 2;
const expired = (cached, retention, now) => !Number.isFinite(cached?.savedAt)
  || now - cached.savedAt > retention || cached.value == null;

function storageOrNull(storage) {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

function read(key, retention, storage) {
  try {
    const target = storageOrNull(storage);
    let cached;
    try { cached = JSON.parse(target?.getItem(key) || "null"); } catch { cached = null; }
    if (expired(cached, retention, Date.now())) {
      target?.removeItem(key);
      return null;
    }
    return cached.value ?? null;
  } catch {
    return null;
  }
}

function write(key, value, storage) {
  try {
    storageOrNull(storage)?.setItem(key, JSON.stringify({savedAt: Date.now(), value}));
  } catch {
    // 缓存失败不影响在线使用。
  }
  return value;
}

function retainedFeeds(target, now) {
  // Snapshot keys before removing anything: Storage.key() indices shift on removal.
  const keys = Array.from({length: target.length}, (_, i) => target.key(i))
    .filter(key => typeof key === "string" && key.startsWith(FEED_PREFIX));
  const entries = [];
  for (const key of keys) {
    const raw = target.getItem(key);
    let cached;
    try { cached = JSON.parse(raw); } catch { cached = null; }
    if (expired(cached, FEED_RETENTION_MS, now)) target.removeItem(key);
    else entries.push({key, savedAt: cached.savedAt, bytes: storedBytes(key, raw)});
  }
  return entries.sort((a, b) => a.savedAt - b.savedAt || a.key.localeCompare(b.key));
}

function trimFeeds(target, entries, extraBytes = 0, extraCount = 0) {
  let bytes = entries.reduce((total, entry) => total + entry.bytes, extraBytes);
  while (entries.length && (entries.length + extraCount > SCREEN_FEED_CACHE_MAX_ENTRIES ||
    bytes > SCREEN_FEED_CACHE_MAX_BYTES)) {
    const oldest = entries[0];
    target.removeItem(oldest.key);
    entries.shift();
    bytes -= oldest.bytes;
  }
}

function pruneFeeds(storage) {
  try {
    const target = storageOrNull(storage);
    if (target) trimFeeds(target, retainedFeeds(target, Date.now()));
  } catch { /* Cache maintenance must not prevent offline startup. */ }
}

export function loadCachedScreenSession(storage) {
  pruneFeeds(storage);
  return read(SESSION_KEY, SESSION_RETENTION_MS, storage);
}

export function saveCachedScreenSession(session, storage) {
  return write(SESSION_KEY, session, storage);
}

export function clearCachedScreenSession(storage) {
  try {
    storageOrNull(storage)?.removeItem(SESSION_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function screenFeedCacheKey(bindingId, boardDate) {
  return `${FEED_PREFIX}${bindingId || "unbound"}:${boardDate}`;
}

export function loadCachedScreenFeed(bindingId, boardDate, storage) {
  return read(screenFeedCacheKey(bindingId, boardDate), FEED_RETENTION_MS, storage);
}

export function saveCachedScreenFeed(bindingId, boardDate, feed, storage) {
  try {
    const target = storageOrNull(storage);
    if (!target) return feed;
    const now = Date.now();
    const key = screenFeedCacheKey(bindingId, boardDate);
    const raw = JSON.stringify({savedAt: now, value: feed});
    const bytes = storedBytes(key, raw);
    const retained = retainedFeeds(target, now);
    if (bytes > SCREEN_FEED_CACHE_MAX_BYTES) {
      trimFeeds(target, retained);
      return feed;
    }
    const others = retained.filter(entry => entry.key !== key);
    trimFeeds(target, others, bytes, 1);
    while (true) {
      try { target.setItem(key, raw); break; } catch (error) {
        if (error?.name !== "QuotaExceededError" || !others.length) throw error;
        target.removeItem(others.shift().key);
      }
    }
  } catch { /* Display caching is best effort; pending uploads are never removed. */ }
  return feed;
}
