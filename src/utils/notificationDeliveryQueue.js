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
} = {}) {
  if (typeof send !== "function") throw new TypeError("send must be a function");

  const pending = new Map();
  let retryTimer = null;
  let inFlight = false;
  let disposed = false;
  let failures = 0;
  let blockedStatus = null;
  let storageError = null;
  let lastSaved = null;

  function persist() {
    if (!storage || !storageKey || disposed || storageError === "read") return;
    const value = JSON.stringify({version: 1, items: [...pending.values()], blockedStatus});
    if (value === lastSaved && !storageError) return;
    try {
      storage.setItem(storageKey, value);
      lastSaved = value;
      storageError = null;
    } catch { storageError = "write"; }
  }

  function restore() {
    if (!storage || !storageKey) return;
    try {
      const raw = storage.getItem(storageKey);
      const value = raw === null ? {version: 1, items: [], blockedStatus: null} : JSON.parse(raw);
      if (value?.version !== 1 || !Array.isArray(value.items) || value.items.some(item =>
        !item || typeof item.publicationId !== "string" || !item.publicationId || !Number.isInteger(item.revision) || item.revision < 1 ||
        typeof item.displayed !== "boolean" || typeof item.acknowledged !== "boolean") ||
        (value.blockedStatus !== null && (!Number.isInteger(value.blockedStatus) || value.blockedStatus < 400 ||
          value.blockedStatus >= 500 || [408, 429].includes(value.blockedStatus)))) throw new Error("Invalid receipt queue");
      // Merge known memory entries after disk entries when storage recovers.
      const known = [...pending.values()];
      value.items.forEach(merge);
      known.forEach(merge);
      blockedStatus = blockedStatus || value.blockedStatus;
      storageError = null;
      lastSaved = raw;
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
    if (disposed || blockedStatus || storageError === "read" || !isOnline() || inFlight || retryTimer !== null || !pending.size) return false;

    const batch = [...pending.values()].slice(0, 100);
    inFlight = true;
    report();
    let succeeded = false;
    try {
      await send(batch);
      if (disposed) return false;
      succeeded = true;
      failures = 0;
      batch.forEach((sent) => {
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
      inFlight = false;
      persist();
      report();
    }

    if (succeeded && pending.size) void flush();
    return succeeded;
  }

  function merge(item) {
      if (typeof item?.publicationId !== "string" || !item.publicationId || !Number.isInteger(item.revision) || item.revision < 1) return;
      const previous = pending.get(item.publicationId);
      if (previous && previous.revision > item.revision) return;
      const sameRevision = previous?.revision === item.revision;
      const acknowledged = item.acknowledged === true || (sameRevision && previous.acknowledged);
      pending.set(item.publicationId, {
        publicationId: item.publicationId,
        revision: item.revision,
        displayed: Boolean(item.displayed === true || acknowledged || (sameRevision && previous.displayed)),
        acknowledged: Boolean(acknowledged),
      });
  }

  function enqueue(items) {
    if (disposed) return;
    (Array.isArray(items) ? items : []).forEach(merge);
    persist();
    report();
    void flush();
  }

  function retryNow() {
    if (disposed) return false;
    if (storageError === "read") restore();
    persist();
    pause();
    failures = 0;
    return flush();
  }

  function dispose() {
    persist();
    disposed = true;
    if (retryTimer !== null) cancel(retryTimer);
    retryTimer = null;
    pending.clear();
  }

  restore();
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
