export const MANUAL_NOISE_LIMIT_MS = 3 * 60 * 60 * 1000;

export function createNoiseMonitoringController(service, {
  now = () => Date.now(),
  monotonicNow = () => globalThis.performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = timer => clearTimeout(timer),
} = {}) {
  let readContext = null;
  let context = {};
  let deadline = 0;
  let monotonicDeadline = 0;
  let timer = null;
  let expired = false;
  let attemptedKey = "";
  let unsubscribe = null;
  let lastStatus = service.status;
  const listeners = new Set();
  let lastSerialized = "";

  function snapshot() {
    return {bindingId: context.bindingId || "", status: service.status,
      manualActive: Boolean(deadline), manualEndsAt: deadline, manualExpired: expired,
      scheduledActive: Boolean(context.enabled && context.scheduleKey), scheduledEndTime: context.endTime || ""};
  }
  function publish() {
    const state = snapshot();
    const serialized = JSON.stringify(state);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    listeners.forEach(listener => listener(state));
  }
  function clearManual() {
    deadline = 0;
    monotonicDeadline = 0;
    if (timer !== null) cancel(timer);
    timer = null;
  }
  function armDeadline() {
    if (timer !== null) cancel(timer);
    timer = deadline ? schedule(() => { timer = null; tick(); },
      Math.max(0, Math.min(deadline - now(), monotonicDeadline - monotonicNow()))) : null;
  }
  function attemptKey() {
    return JSON.stringify([context.scopeKey, deadline || context.scheduleKey, context.deviceId || "default"]);
  }
  function reconcile(retry) {
    const wanted = context.enabled && (deadline || context.scheduleKey);
    if (!wanted) {
      attemptedKey = "";
      if (["active", "initializing"].includes(service.status)) void service.stop();
      return;
    }
    if (["active", "initializing"].includes(service.status)) return;
    const key = attemptKey();
    if (!retry && attemptedKey === key && ["error", "permission-denied", "unavailable"].includes(service.status)) return;
    attemptedKey = key;
    void service.start({deviceId: context.deviceId});
  }
  function tick({retry = false} = {}) {
    if (!readContext) return;
    const next = readContext();
    if (next.scopeKey !== context.scopeKey || !next.enabled) {
      clearManual(); expired = false; attemptedKey = "";
      if (next.scopeKey !== context.scopeKey || ["active", "initializing"].includes(service.status)) void service.stop();
    }
    context = next;
    if (deadline && (now() >= deadline || monotonicNow() >= monotonicDeadline)) {
      clearManual(); expired = true;
    }
    if (deadline && timer === null) armDeadline();
    reconcile(retry);
    publish();
  }
  function enforceDeadline() {
    if (deadline && (now() >= deadline || monotonicNow() >= monotonicDeadline)) tick();
  }
  function startManual(bindingId) {
    tick();
    if (!readContext || !context.enabled || context.bindingId !== bindingId) return false;
    if (!deadline) {
      deadline = now() + MANUAL_NOISE_LIMIT_MS;
      monotonicDeadline = monotonicNow() + MANUAL_NOISE_LIMIT_MS;
      expired = false;
      armDeadline();
    }
    reconcile(true);
    publish();
    return true;
  }
  function stopManual() {
    tick();
    clearManual(); expired = false;
    reconcile(false);
    publish();
  }
  function detach() {
    readContext = null;
    clearManual(); expired = false; context = {}; attemptedKey = "";
    unsubscribe?.(); unsubscribe = null;
    if (service.activityGuard === enforceDeadline) service.activityGuard = null;
    void service.stop();
    publish();
  }
  return {
    attach(provider) {
      readContext = provider;
      service.activityGuard = enforceDeadline;
      unsubscribe?.();
      unsubscribe = service.subscribe(() => {
        if (lastStatus === service.status) return;
        lastStatus = service.status;
        // The picker can restart an active stream itself. Count that attempt too.
        if (service.status === "initializing" && context.enabled && (deadline || context.scheduleKey)) attemptedKey = attemptKey();
        publish();
      });
      tick();
      return detach;
    },
    tick, startManual, stopManual, snapshot,
    dismissExpiry() { expired = false; publish(); },
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
  };
}
