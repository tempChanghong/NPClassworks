const PREFIX = "classworks-v2-screen-publication-queue:";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 50;

export class ScreenPublicationQueueError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ScreenPublicationQueueError";
    this.code = code;
  }
}

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
  )).map((item) => ({
    id: String(item.id),
    input: item.input,
    context: item.context && typeof item.context === "object" ? item.context : {},
    queuedAt: item.queuedAt,
    attempts: Math.max(0, Number(item.attempts) || 0),
    status: item.status === "needs_review" || now - item.queuedAt > RETENTION_MS ? "needs_review" : "pending",
    error: item.error && typeof item.error === "object" ? item.error
      : now - item.queuedAt > RETENTION_MS
        ? {code: "SCREEN_QUEUE_EXPIRED", message: "这项作业已等待超过 7 天，请核对日期和内容后手动提交，或确认移除。"}
        : null,
  })).sort((left, right) => left.queuedAt - right.queuedAt);
}

export function loadScreenPublicationQueue(bindingId, storage, {strict = false} = {}) {
  try {
    const target = storageOrNull(storage);
    if (!target) throw new Error("Storage unavailable");
    const items = JSON.parse(target.getItem(screenPublicationQueueKey(bindingId)) || "[]");
    if (!Array.isArray(items)) throw new Error("Invalid queue");
    return sanitizeScreenPublicationQueue(items);
  } catch {
    if (strict) throw new ScreenPublicationQueueError("SCREEN_QUEUE_READ_FAILED", "无法读取本机待提交作业，未保存本次输入。请勿关闭或刷新录入窗口，恢复本地存储后重试。");
    return [];
  }
}

export function saveScreenPublicationQueue(bindingId, items, storage) {
  const normalized = sanitizeScreenPublicationQueue(items);
  try {
    const target = storageOrNull(storage);
    if (!target) throw new Error("Storage unavailable");
    target.setItem(screenPublicationQueueKey(bindingId), JSON.stringify(normalized));
  } catch {
    throw new ScreenPublicationQueueError("SCREEN_QUEUE_WRITE_FAILED", "本机存储不可用或空间不足，未能保存队列更改。当前输入仍在窗口中，请勿关闭或刷新，恢复存储或联网后重试。");
  }
  return normalized;
}

export function enqueueScreenPublication(bindingId, input, context = {}, storage, now = Date.now()) {
  const items = loadScreenPublicationQueue(bindingId, storage, {strict: true});
  if (items.length >= MAX_ITEMS) {
    throw new ScreenPublicationQueueError("SCREEN_QUEUE_FULL", "本机待提交作业已达到 50 项，未保存本次输入。请保留当前输入，先在同步队列中提交或确认移除已有作业，再重试。");
  }
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
  return saveScreenPublicationQueue(bindingId, loadScreenPublicationQueue(bindingId, storage, {strict: true})
    .map((item) => item.id === itemId ? {...item, ...patch} : item), storage);
}

export function removeScreenPublicationQueueItem(bindingId, itemId, storage) {
  return saveScreenPublicationQueue(bindingId, loadScreenPublicationQueue(bindingId, storage, {strict: true})
    .filter((item) => item.id !== itemId), storage);
}
