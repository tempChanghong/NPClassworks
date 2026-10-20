// Static entries keep Vite's CSS/preload handling. A failed ES-module URL may
// remain failed in the browser module map, so an explicit retry uses a distinct,
// build-resolved entry. Dependencies, model and recognition math stay shared.
const entries = [
  () => import('./HandwritingInput.vue'),
  () => import('./HandwritingInput.vue?input-recovery=1'),
  () => import('./HandwritingInput.vue?input-recovery=2'),
];
let loaded, pending, failures = 0;
export function loadHandwritingEditor() {
  if (loaded) return Promise.resolve(loaded);
  if (failures === entries.length) return Promise.reject(Object.assign(new Error('Editor entry unavailable'), {requiresReload: true}));
  if (!pending) pending = entries[failures]().then(module => {
    loaded = module; return module;
  }, error => {
    failures++; throw Object.assign(error, {requiresReload: failures === entries.length});
  }).finally(() => { pending = null; });
  return pending;
}
