export function createScreenUploadRetry({
  run, isOnline, hasPending,
  onError = () => {},
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
  random = () => Math.random(),
} = {}) {
  let timer = null;
  let failures = 0;
  let disposed = false;
  let generation = 0;
  const fraction = () => Math.max(0, Math.min(1, Number(random()) || 0));
  function pause() {
    generation += 1;
    if (timer !== null) cancel(timer);
    timer = null;
  }
  function request({recovered = false} = {}) {
    if (disposed) return;
    if (!isOnline() || !hasPending()) { pause(); return; }
    if (recovered) { pause(); failures = 0; }
    if (timer !== null) return;
    const ceiling = Math.min(300_000, 30_000 * 2 ** Math.min(Math.max(0, failures - 1), 20));
    const delay = failures ? Math.round(ceiling * (0.5 + fraction() * 0.5)) : Math.round(fraction() * 2000);
    const scheduledGeneration = ++generation;
    timer = schedule(() => {
      if (scheduledGeneration !== generation) return;
      timer = null;
      void Promise.resolve().then(() => {
        if (!disposed && scheduledGeneration === generation && isOnline() && hasPending()) return run();
      }).catch(onError);
    }, delay);
  }
  return {
    request,
    pause,
    begin: pause,
    failed() { pause(); failures += 1; },
    succeeded() { failures = 0; },
    dispose() { disposed = true; pause(); },
  };
}
