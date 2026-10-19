import createModule from './assets/ort-wasm-simd-threaded.mjs';
import {installModelBufferOwnership} from './ort-model-owner.js';
export default async function createOwnedModule(options){
  const module=await createModule(options);module.labModelOwnership=installModelBufferOwnership(module);return module;
}
