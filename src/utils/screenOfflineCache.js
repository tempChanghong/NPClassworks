const SESSION_KEY = "classworks-v2-screen-session-cache";
const FEED_PREFIX = "classworks-v2-screen-feed-cache:";
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FEED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

function storageOrNull(storage) {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

function read(key, retention, storage) {
  const target = storageOrNull(storage);
  try {
    const cached = JSON.parse(target?.getItem(key) || "null");
    if (!cached?.savedAt || Date.now() - cached.savedAt > retention) return null;
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

export function loadCachedScreenSession(storage) {
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
  return write(screenFeedCacheKey(bindingId, boardDate), feed, storage);
}
