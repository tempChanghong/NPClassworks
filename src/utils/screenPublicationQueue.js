const PREFIX = "classworks-v2-screen-publication-queue:";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 50;

export function screenPublicationQueueKey(bindingId) {
  return `${PREFIX}${bindingId || "unbound"}`;
}

function storageOrNull(storage) {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

function makeId(now) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `queued-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeScreenPublicationQueue(value, now = Date.now()) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => (
    item?.id
    && item.input
    && typeof item.input === "object"
    && Number.isFinite(item.queuedAt)
    && now - item.queuedAt <= RETENTION_MS
  )).map((item) => ({
    id: String(item.id),
    input: item.input,
    context: item.context && typeof item.context === "object" ? item.context : {},
    queuedAt: item.queuedAt,
    attempts: Math.max(0, Number(item.attempts) || 0),
    status: item.status === "needs_review" ? "needs_review" : "pending",
    error: item.error && typeof item.error === "object" ? item.error : null,
  })).sort((left, right) => left.queuedAt - right.queuedAt).slice(-MAX_ITEMS);
}

export function loadScreenPublicationQueue(bindingId, storage) {
  const target = storageOrNull(storage);
  if (!target) return [];
  try {
    return sanitizeScreenPublicationQueue(JSON.parse(target.getItem(screenPublicationQueueKey(bindingId)) || "[]"));
  } catch {
    return [];
  }
}

export function saveScreenPublicationQueue(bindingId, items, storage) {
  const target = storageOrNull(storage);
  const normalized = sanitizeScreenPublicationQueue(items);
  try {
    target?.setItem(screenPublicationQueueKey(bindingId), JSON.stringify(normalized));
  } catch {
    // 存储空间不足时仍返回内存中的队列，调用方可显示错误。
  }
  return normalized;
}

export function enqueueScreenPublication(bindingId, input, context = {}, storage, now = Date.now()) {
  const items = loadScreenPublicationQueue(bindingId, storage);
  items.push({
    id: makeId(now),
    input,
    context,
    queuedAt: now,
    attempts: 0,
    status: "pending",
    error: null,
  });
  return saveScreenPublicationQueue(bindingId, items, storage);
}

export function updateScreenPublicationQueueItem(bindingId, itemId, patch, storage) {
  return saveScreenPublicationQueue(bindingId, loadScreenPublicationQueue(bindingId, storage)
    .map((item) => item.id === itemId ? {...item, ...patch} : item), storage);
}

export function removeScreenPublicationQueueItem(bindingId, itemId, storage) {
  return saveScreenPublicationQueue(bindingId, loadScreenPublicationQueue(bindingId, storage)
    .filter((item) => item.id !== itemId), storage);
}
