// Lazy editors share a download, but only the latest requested field may open.
// Keep only an abort controller here, never an editor, target or text.
let active;
export function beginTextInputActivation() {
  active?.abort();
  const controller = new AbortController(), {signal} = controller;
  active = controller;
  return {
    current: () => active === controller && !signal.aborted,
    // Cancel only this field's wait. Other fields can share the import, and a
    // canceled download completing later must never open its original field.
    wait: promise => new Promise((resolve, reject) => {
      const finish = (settle, value) => { signal.removeEventListener('abort', cancel); settle(value); };
      const cancel = () => finish(reject, new globalThis.DOMException('Editor activation canceled', 'AbortError'));
      signal.addEventListener('abort', cancel, {once: true});
      Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
      if (signal.aborted) cancel();
    }),
    release: () => { controller.abort(); if (active === controller) active = null; },
  };
}
