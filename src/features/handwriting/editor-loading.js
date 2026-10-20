// Dynamic imports cannot be aborted. Bound the shared wait and fence each
// attempt so a late module/error cannot replace or retire a newer retry.
export function createEditorLoader(entries) {
  let loaded, pending, nextEntry = 0;
  return function load() {
    if (loaded) return Promise.resolve(loaded);
    if (pending) return pending.promise;
    if (nextEntry === entries.length) return Promise.reject(Object.assign(new Error('Editor entry unavailable'), {requiresReload: true}));
    const entry = entries[nextEntry++], attempt = {};
    pending = attempt;
    attempt.promise = new Promise((resolve, reject) => {
      const finish = (error, module) => {
        if (pending !== attempt) return;
        clearTimeout(attempt.timeout); pending = null;
        if (error) reject(Object.assign(new Error(error.message || 'Editor entry unavailable'), {
          requiresReload: nextEntry === entries.length,
          loadTimedOut: error.loadTimedOut === true,
        }));
        else { loaded = module; resolve(module); }
      };
      attempt.timeout = setTimeout(() => finish(Object.assign(new Error('Editor download timed out'), {loadTimedOut: true})), 90000);
      Promise.resolve().then(entry).then(module => finish(null, module), error => finish(error));
    });
    return attempt.promise;
  };
}
