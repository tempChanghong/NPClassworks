import {createEditorLoader} from './editor-loading.js';

// Static entries keep Vite's CSS/preload handling. A failed ES-module URL may
// remain failed in the browser module map, so an explicit retry uses a distinct,
// build-resolved entry. Dependencies, model and recognition math stay shared.
const entries = [
  () => import('./HandwritingInput.vue'),
  () => import('./HandwritingInput.vue?input-recovery=1'),
  () => import('./HandwritingInput.vue?input-recovery=2'),
];
export const loadHandwritingEditor = createEditorLoader(entries);
