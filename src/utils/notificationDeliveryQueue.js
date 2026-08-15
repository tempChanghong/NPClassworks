const DEFAULT_RETRY_DELAY = 10_000;

export function createNotificationDeliveryQueue({
  send,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
  retryDelay = DEFAULT_RETRY_DELAY,
} = {}) {
  if (typeof send !== "function") throw new TypeError("send must be a function");

  const pending = new Map();
  let retryTimer = null;
  let inFlight = false;
  let disposed = false;

  function scheduleRetry() {
    if (disposed || retryTimer !== null) return;
    retryTimer = schedule(() => {
      retryTimer = null;
      void flush();
    }, retryDelay);
  }

  async function flush() {
    if (disposed || inFlight || !pending.size) return false;
    if (retryTimer !== null) {
      cancel(retryTimer);
      retryTimer = null;
    }

    const batch = [...pending.values()];
    inFlight = true;
    let succeeded = false;
    try {
      await send(batch);
      succeeded = true;
      batch.forEach((sent) => {
        const current = pending.get(sent.publicationId);
        if (current?.revision === sent.revision && current?.acknowledged === sent.acknowledged) {
          pending.delete(sent.publicationId);
        }
      });
    } catch {
      scheduleRetry();
    } finally {
      inFlight = false;
    }

    if (succeeded && pending.size) void flush();
    return succeeded;
  }

  function enqueue(items) {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item?.publicationId || !Number.isInteger(item.revision)) continue;
      pending.set(item.publicationId, {
        publicationId: item.publicationId,
        revision: item.revision,
        displayed: item.displayed === true || item.acknowledged === true,
        acknowledged: item.acknowledged === true,
      });
    }
    void flush();
  }

  function retryNow() {
    if (retryTimer !== null) {
      cancel(retryTimer);
      retryTimer = null;
    }
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
    pendingCount: () => pending.size,
    retryNow,
  };
}
