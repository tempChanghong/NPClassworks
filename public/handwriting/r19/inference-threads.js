// At most one additional compute thread, leaving room for input and rendering.
// Missing CPU or low resource hints stay on the existing single-thread path.
export function inferenceThreads(scope=globalThis,forceSingle=false){
  const cores=scope.navigator?.hardwareConcurrency,memory=scope.navigator?.deviceMemory;
  return !forceSingle&&scope.crossOriginIsolated===true&&typeof scope.SharedArrayBuffer==='function'&&Number.isInteger(cores)&&cores>=4&&(memory===undefined||Number.isFinite(memory)&&memory>=4)?2:1;
}
