// Pinned ORT Web 1.30 bridge compatibility: its createSession finally block frees
// the input pointer. Zero-copy ORT initializers instead need that pointer until
// _OrtReleaseSession. Retain that single JS-side free, then release on disposal.
const installed=new WeakMap();
export function installModelBufferOwnership(module){
  if(installed.has(module))return installed.get(module);
  for(const name of ['_OrtCreateSession','_OrtReleaseSession','_free'])if(typeof module[name]!=='function')throw Error('识别运行库接口不兼容。');
  if(module.PTR_SIZE!==4||!module.HEAPU8)throw Error('识别运行库内存接口不兼容。');
  const create=module._OrtCreateSession,release=module._OrtReleaseSession,free=module._free,live=new Map(),pointers=new Set(),skipOneFree=new Set();
  const isORT=(ptr,length)=>Number.isInteger(ptr)&&ptr>0&&Number.isInteger(length)&&length>=8&&ptr+length<=module.HEAPU8.length&&[79,82,84,77].every((v,i)=>module.HEAPU8[ptr+4+i]===v);
  module._OrtCreateSession=async(ptr,length,...args)=>{
    const retain=isORT(ptr,length);if(retain&&pointers.has(ptr))throw Error('识别模型内存已被其他会话使用。');
    const handle=await create(ptr,length,...args);
    if(handle&&retain){live.set(handle,{ptr,length});pointers.add(ptr);skipOneFree.add(ptr);}
    return handle;
  };
  module._free=ptr=>{
    if(skipOneFree.delete(ptr))return;
    if(pointers.has(ptr))throw Error('识别会话仍在使用模型内存。');
    return free(ptr);
  };
  module._OrtReleaseSession=handle=>{
    const entry=live.get(handle),result=release(handle);
    if(result===0&&entry){live.delete(handle);pointers.delete(entry.ptr);free(entry.ptr);}
    return result;
  };
  const stats=()=>({sessions:live.size,modelBytes:[...live.values()].reduce((n,x)=>n+x.length,0),pendingBridgeFrees:skipOneFree.size});installed.set(module,stats);return stats;
}
