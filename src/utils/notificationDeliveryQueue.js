import {withBrowserStorageLock} from "./browserStorageLock.js";

const DEFAULT_RETRY_DELAY = 10_000;

export function notificationDeliveryStorageKey(serverUrl, binding) {
  if (!binding?.id) return "";
  return `classworks-v2-notification-delivery:${encodeURIComponent(serverUrl)}:${encodeURIComponent(binding.id)}:${binding.credentialVersion || 1}`;
}

export function createNotificationDeliveryQueue({
  send,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
  retryDelay = DEFAULT_RETRY_DELAY,
  maxRetryDelay = 5 * 60_000,
  isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false,
  onStateChange = () => {},
  storage = null,
  storageKey = "",
  withLock = operation => withBrowserStorageLock(storageKey, operation),
  eventTarget = globalThis.window,
} = {}) {
  if (typeof send !== "function") throw new TypeError("send must be a function");

  const pending = new Map();
  // Only local changes may be merged back into disk. A stale full snapshot must
  // never resurrect receipts another tab has already sent.
  const additions = new Map();
  const completed = new Map();
  const persistent = Boolean(storage && storageKey);
  const stagingPrefix = `${storageKey}:staged:`;
  const canStage = persistent && typeof storage.key === "function" && typeof storage.removeItem === "function";
  let retryTimer = null;
  let inFlight = false;
  let disposed = false;
  let failures = 0;
  let blockedStatus = null;
  let storageError = null;
  const same = (a, b) => a?.revision === b?.revision && a?.displayed === b?.displayed && a?.acknowledged === b?.acknowledged;

  function decode(raw) {
    const value = raw === null ? {version: 1, items: [], blockedStatus: null} : JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.items) || value.items.some(item =>
      !item || typeof item.publicationId !== "string" || !item.publicationId || !Number.isInteger(item.revision) || item.revision < 1 ||
      typeof item.displayed !== "boolean" || typeof item.acknowledged !== "boolean") ||
      (value.blockedStatus !== null && (!Number.isInteger(value.blockedStatus) || value.blockedStatus < 400 ||
        value.blockedStatus >= 500 || [408, 429].includes(value.blockedStatus)))) throw new Error("Invalid receipt queue");
    return value;
  }

  function readDisk() {
    const raw = storage.getItem(storageKey);
    const value = decode(raw);
    const stagedKeys = [];
    if (canStage) {
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key?.startsWith(stagingPrefix)) continue;
        const staged = storage.getItem(key);
        if (staged === null) continue;
        value.items.push(...decode(staged).items);
        stagedKeys.push(key);
      }
    }
    return {raw, value, stagedKeys};
  }

  async function synchronize() {
    if (!persistent) return true;
    try {
      return await withLock(() => {
        let disk;
        try { disk = readDisk(); } catch { storageError = "read"; report(); return false; }
        const latest = new Map();
        disk.value.items.forEach(item => merge(item, latest));
        additions.forEach(item => merge(item, latest));
        completed.forEach(sent => {
          if (same(latest.get(sent.publicationId), sent)) latest.delete(sent.publicationId);
        });
        blockedStatus ||= disk.value.blockedStatus;
        if (!disposed) { pending.clear(); latest.forEach(item => merge(item)); }
        const encoded = JSON.stringify({version: 1, items: [...latest.values()], blockedStatus});
        try {
          if (encoded !== disk.raw) storage.setItem(storageKey, encoded);
          additions.clear(); completed.clear();
          // Each intake key is immutable and unique. New arrivals after the read
          // are untouched, and deletion only follows successful consolidation.
          disk.stagedKeys.forEach(key => storage.removeItem(key));
          storageError = null;
          report(); return true;
        } catch { storageError = "write"; report(); return false; }
      });
    } catch { storageError = "lock"; report(); return false; }
  }

  function restore() {
    if (!persistent) return;
    try {
      const {value} = readDisk();
      value.items.forEach(item => merge(item));
      blockedStatus = value.blockedStatus;
    } catch { storageError = "read"; }
  }

  function getState() {
    return {
      status: disposed ? "disposed" : blockedStatus ? "blocked" : !isOnline() ? "offline"
        : inFlight ? "sending" : retryTimer !== null ? "waiting" : pending.size ? "pending" : "idle",
      pendingCount: pending.size,
      failures,
      blockedStatus,
      storageError,
    };
  }

  function report() {
    if (!disposed) onStateChange(getState());
  }

  function pause() {
    if (retryTimer !== null) cancel(retryTimer);
    retryTimer = null;
    report();
  }

  function scheduleRetry() {
    if (disposed || blockedStatus || !isOnline() || retryTimer !== null) return;
    retryTimer = schedule(() => {
      retryTimer = null;
      void flush();
    }, Math.min(maxRetryDelay, retryDelay * 2 ** Math.min(Math.max(0, failures - 1), 20)));
  }

  async function flush() {
    if (disposed || blockedStatus || !isOnline() || inFlight || retryTimer !== null) return false;
    inFlight = true;
    if (persistent) await synchronize();
    if (disposed || blockedStatus || ["read", "lock"].includes(storageError) || !isOnline() || !pending.size) {
      inFlight = false; report(); return false;
    }
    const batch = [...pending.values()].slice(0, 100);
    report();
    let succeeded = false;
    try {
      await send(batch);
      if (disposed) return false;
      succeeded = true;
      failures = 0;
      batch.forEach((sent) => {
        if (persistent) merge(sent, completed);
        const current = pending.get(sent.publicationId);
        if (current?.revision === sent.revision && current?.acknowledged === sent.acknowledged
          && current?.displayed === sent.displayed) {
          pending.delete(sent.publicationId);
        }
      });
    } catch (error) {
      if (disposed) return false;
      failures += 1;
      const status = Number(error?.response?.status || error?.status) || null;
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        // 保留本次会话的全部待处理回执；重新绑定会创建新队列。
        blockedStatus = status;
      } else {
        scheduleRetry();
      }
    } finally {
      if (!disposed && persistent) await synchronize();
      inFlight = false;
      report();
    }

    if (succeeded && pending.size) void flush();
    return succeeded;
  }

  function merge(item, target = pending) {
    if (typeof item?.publicationId !== "string" || !item.publicationId || !Number.isInteger(item.revision) || item.revision < 1) return;
    const previous = target.get(item.publicationId);
    if (previous && previous.revision > item.revision) return;
    const sameRevision = previous?.revision === item.revision;
    const acknowledged = item.acknowledged === true || (sameRevision && previous.acknowledged);
    target.set(item.publicationId, {
      publicationId: item.publicationId,
      revision: item.revision,
      displayed: Boolean(item.displayed === true || acknowledged || (sameRevision && previous.displayed)),
      acknowledged: Boolean(acknowledged),
    });
  }

  function enqueue(items) {
    if (disposed) return Promise.resolve(false);
    const intake = new Map();
    (Array.isArray(items) ? items : []).forEach(item => {
      merge(item);
      merge(item, intake);
    });
    if (persistent && intake.size) {
      let staged = false;
      if (canStage && storageError !== "read") {
        try {
          const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`;
          storage.setItem(`${stagingPrefix}${id}`, JSON.stringify({version: 1, items: [...intake.values()], blockedStatus: null}));
          staged = true;
        } catch { storageError = "write"; }
      }
      if (!staged) intake.forEach(item => merge(item, additions));
    }
    report();
    if (persistent) return synchronize().then(saved => { void flush(); return saved; });
    void flush();
    return Promise.resolve(true);
  }

  async function retryNow() {
    if (disposed) return false;
    if (persistent) await synchronize();
    pause();
    failures = 0;
    return flush();
  }

  function dispose() {
    disposed = true;
    eventTarget?.removeEventListener?.("storage", onStorage);
    if (retryTimer !== null) cancel(retryTimer);
    retryTimer = null;
    pending.clear();
    // Finish genuine local changes queued before a route/session was disposed,
    // but never write the disposed instance's full stale snapshot.
    return persistent && (additions.size || completed.size) ? synchronize() : Promise.resolve();
  }

  function onStorage(event) {
    if (disposed || (event.key !== storageKey && event.key !== null && !event.key?.startsWith(stagingPrefix))) return;
    void synchronize().then(() => { void flush(); });
  }

  restore();
  if (persistent) eventTarget?.addEventListener?.("storage", onStorage);
  report();
  return {
    dispose,
    enqueue,
    flush,
    getState,
    pause,
    pendingCount: () => pending.size,
    retryNow,
  };
}
