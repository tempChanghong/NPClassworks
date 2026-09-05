const DEFAULT_RETRY_DELAY = 10_000;

export function createNotificationDeliveryQueue({
  send,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
  retryDelay = DEFAULT_RETRY_DELAY,
  maxRetryDelay = 5 * 60_000,
  isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false,
  onStateChange = () => {},
} = {}) {
  if (typeof send !== "function") throw new TypeError("send must be a function");

  const pending = new Map();
  let retryTimer = null;
  let inFlight = false;
  let disposed = false;
  let failures = 0;
  let blockedStatus = null;

  function getState() {
    return {
      status: disposed ? "disposed" : blockedStatus ? "blocked" : !isOnline() ? "offline"
        : inFlight ? "sending" : retryTimer !== null ? "waiting" : pending.size ? "pending" : "idle",
      pendingCount: pending.size,
      failures,
      blockedStatus,
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
    if (disposed || blockedStatus || !isOnline() || inFlight || retryTimer !== null || !pending.size) return false;

    const batch = [...pending.values()];
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
      report();
    }

    if (succeeded && pending.size) void flush();
    return succeeded;
  }

  function enqueue(items) {
    if (disposed) return;
    for (const item of Array.isArray(items) ? items : []) {
      if (!item?.publicationId || !Number.isInteger(item.revision)) continue;
      const previous = pending.get(item.publicationId);
      if (previous && previous.revision > item.revision) continue;
      const sameRevision = previous?.revision === item.revision;
      const acknowledged = item.acknowledged === true || (sameRevision && previous.acknowledged);
      pending.set(item.publicationId, {
        publicationId: item.publicationId,
        revision: item.revision,
        displayed: item.displayed === true || acknowledged || (sameRevision && previous.displayed),
        acknowledged: Boolean(acknowledged),
      });
    }
    report();
    void flush();
  }

  function retryNow() {
    pause();
    failures = 0;
    return flush();
  }

  function dispose() {
    disposed = true;
    if (retryTimer !== null) cancel(retryTimer);
    retryTimer = null;
    pending.clear();
  }

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
