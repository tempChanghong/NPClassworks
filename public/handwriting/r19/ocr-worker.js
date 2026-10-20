import {validInputLine,releaseInputBuffers,releaseCompletedInput} from './recognition-limits.js';
import {decodeTopK,isConfusable} from './ctc.js';
import {characterChoices,rangeChoices} from './refine.js';
import {normalizeHomeworkText,CONTEXT_VERSION} from './context.js';
import {MODEL_SHA,DICTIONARY_SHA,RUNTIME_VERSION} from './model-build.js';
import {createMemoryMatcher,MEMORY_VERSION} from './handwriting-memory.js';
import {createMemoryReader} from './memory-store.js';
import {inferenceThreads} from './inference-threads.js';
const MODEL='PP-OCRv6 small';
const modelInfo={modelName:MODEL,modelSha256:MODEL_SHA,protocol:2,runtimeVersion:RUNTIME_VERSION,memoryMode:'session-owned FP32 ORT',memoryVersion:MEMORY_VERSION,memoryEngine:4};
const memoryReader=createMemoryReader(),memoryMatcher=createMemoryMatcher();let memoryRevision=null;
let session,ort,characters,runtimeThreads=1;
async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
async function prepare(id,forceSingle=false){
  if(session)return {cold:false,loadMs:0,...modelInfo,runtimeThreads};
  const start=performance.now();postMessage({id,type:'progress',message:'正在加载本机识别组件与模型…'});
  ort=await import('./assets/ort.wasm.min.mjs');if(ort.env.versions.web!==RUNTIME_VERSION)throw Error('识别运行库版本不兼容，请重新准备完整离线包。');runtimeThreads=inferenceThreads(globalThis,forceSingle);ort.env.wasm.numThreads=runtimeThreads;ort.env.wasm.wasmPaths={mjs:new URL('./ort-memory-loader.mjs',import.meta.url).href,wasm:new URL('./assets/ort-wasm-simd-threaded.wasm',import.meta.url).href};
  const responses=await Promise.all([fetch('./assets/model-config.json'),fetch('./assets/manifest.json'),fetch('./assets/recognizer.ort')]);
  if(responses.some(r=>!r.ok))throw Error('识别资源不完整，请重新准备离线包。');
  const [configBytes,manifest,bytes]=await Promise.all([responses[0].arrayBuffer(),responses[1].json(),responses[2].arrayBuffer()]);
  if(manifest.assets.find(a=>a.file==='recognizer.ort')?.sha256!==MODEL_SHA||manifest.assets.find(a=>a.file==='model-config.json')?.sha256!==DICTIONARY_SHA||(await digest(bytes))!==MODEL_SHA||(await digest(configBytes))!==DICTIONARY_SHA)throw Error('识别模型或字典版本不一致，请重新加载页面或重新准备离线包。笔迹仍保留。');
  if(new TextDecoder().decode(new Uint8Array(bytes,4,4))!=='ORTM')throw Error('识别模型格式不兼容。');
  const config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(configBytes)),dictionary=config.PostProcess?.character_dict;
  if(!Array.isArray(dictionary)||dictionary.length!==18708||dictionary.some(c=>typeof c!=='string'||[...c].length!==1)||new Set(dictionary).size!==dictionary.length)throw Error('识别字典格式无效。');
  characters=['',...dictionary,' '];
  try{session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'basic',enableCpuMemArena:false,enableMemPattern:false,extra:{session:{use_ort_model_bytes_directly:'1',use_ort_model_bytes_for_initializers:'1',disable_prepacking:'1'}}});}
  catch(error){throw Object.assign(new Error(error.message||String(error)),{retrySingleThread:runtimeThreads>1});}
  runtimeThreads=ort.env.wasm.numThreads;
  const modelBytes=bytes.byteLength;bytes.transfer?.(0);configBytes.transfer?.(0);
  return {cold:true,loadMs:performance.now()-start,modelBytes,...modelInfo,runtimeThreads};
}
self.onmessage=async({data})=>{
  const reuse=data.type==='recognize'&&data.inputReuseVersion===1;let returned=false;
  const reusableBuffers=()=>[...new Set((Array.isArray(data.lines)?data.lines:[]).flatMap(line=>line?.data?.buffer instanceof ArrayBuffer&&line.data.buffer.byteLength===3*48*1536*4?[line.data.buffer]:[]))];
  const reply=payload=>{if(reuse){const buffers=reusableBuffers();postMessage({...payload,inputReuseVersion:1,inputBytesRecycled:buffers.reduce((n,b)=>n+b.byteLength,0),returnedInputBuffers:buffers},buffers);returned=true;}else postMessage(payload);};
  const arrival=performance.now(),queueMs=Number.isFinite(data.sentAt)?performance.timeOrigin+arrival-data.sentAt:null;
  try{
    if(data.protocol!==2)throw Error('识别组件已更新。当前笔迹未清除，请先保留必要内容，再刷新页面。');
    if(data.contextVersion!==undefined&&data.contextVersion!==CONTEXT_VERSION)throw Error('语境纠正组件版本不一致，请保留必要内容后刷新页面。');
    if(data.memoryVersion!==undefined&&data.memoryVersion!==MEMORY_VERSION)throw Error('手写记忆组件版本不一致，请保留笔迹后刷新页面。');
    if(data.type!=='prepare'&&data.type!=='recognize')throw Error('未知的识别请求。');
    if(data.profile!==undefined&&data.profile!=='accurate'&&data.profile!=='baseline')throw Error('未知的识别方案。');
    if(data.type==='recognize'&&(!Array.isArray(data.lines)||data.lines.length<1||data.lines.length>3))throw Error('识别行数无效。');
    if(data.type==='recognize')for(const line of data.lines)if(!validInputLine(line))throw Error('识别图片尺寸无效。');
    if(data.inputReuseVersion!==undefined&&data.inputReuseVersion!==1)throw Error('识别输入复用版本不兼容。');
    if(reuse&&(reusableBuffers().length!==data.lines.length||data.lines.some(line=>line.data.buffer.byteLength!==3*48*1536*4)))throw Error('识别输入复用缓冲无效。');
    const init=await prepare(data.id,data.singleThread===true);if(data.type==='prepare'){postMessage({id:data.id,type:'ready',...init});return;}
    const memoryStarted=performance.now();let memoryEntries=data.memoryEntries||[],memoryWarning=null,indexInfo=null;
    if(data.memoryLocal&&data.profile==='accurate')try{const snapshot=await memoryReader.read();if(snapshot.revision!==memoryRevision||!snapshot.enabled){memoryMatcher.clear();memoryRevision=snapshot.revision;}memoryEntries=snapshot.entries;indexInfo={revision:snapshot.revision,reloaded:snapshot.reloaded,loads:snapshot.loads,entries:snapshot.entries.length};}catch(error){memoryEntries=[];memoryMatcher.clear();memoryReader.clear();memoryRevision=null;memoryWarning=error.message;}
    const memoryLoadMs=performance.now()-memoryStarted,start=performance.now(),lines=[];let inputBytesReleased=0;
    for(const [lineIndex,line] of data.lines.entries()){
      const input=new ort.Tensor('float32',line.data,[1,3,48,line.width]);let outputs;
      try{
        const modelStarted=performance.now();outputs=await session.run({[session.inputNames[0]]:input});
        const modelMs=performance.now()-modelStarted,decodeStarted=performance.now();const decoded=decodeTopK(outputs.topIndices.data,outputs.topScores.data,outputs.blankScores.data,outputs.topScores.dims[1],5,characters),decodeMs=performance.now()-decodeStarted,contextStarted=performance.now(),normalized=data.profile==='baseline'||data.contextVersion!==CONTEXT_VERSION?{text:decoded.text,modelText:decoded.text,changes:[],contextVersion:null}:normalizeHomeworkText(decoded.text),contextMs=performance.now()-contextStarted,text=normalized.text;
        // The new model's direct CTC path won the exploration. Beam outputs remain optional choices.
        // Every line uses one inference; unreliable crop-based automatic substitutions are excluded.
        const originalCandidates=[...new Set([text,decoded.text,...decoded.candidates.map(c=>c.text)])].filter(Boolean).slice(0,4),personal=data.profile==='baseline'?{text,memory:null,memoryMs:0}:memoryMatcher.match(line.memoryFeature,{text,modelText:decoded.text,candidates:originalCandidates,score:decoded.score,uncertainPositions:decoded.tokens.flatMap((t,i)=>t.score<.7?[i]:[])},memoryEntries),candidates=[...new Set([personal.text,...originalCandidates,...(personal.memoryAlternatives||[])])].slice(0,7),confused=t=>t.alternatives.some(a=>isConfusable(t.text,a.text));
        const review=decoded.tokens.filter(t=>t.score<.85||confused(t)).sort((a,b)=>Number(confused(b))-Number(confused(a))).slice(0,8).map(t=>({text:t.text,alternatives:t.alternatives.slice(0,2).map(a=>a.text)}));
        lines.push({row:line.row,inputWidth:line.width,modelMs,decodeMs,...normalized,...personal,contextMs,primaryText:text,greedyText:decoded.text,beamText:decoded.beamText,score:decoded.score,candidates,review,rereads:0,choices:[...rangeChoices(personal.text,decoded.candidates),...characterChoices(personal.text)]});
      }finally{input.dispose();if(outputs)for(const value of Object.values(outputs))value.dispose();if(!reuse)inputBytesReleased+=releaseCompletedInput(data.lines,lineIndex);}
    }
    if(!reuse)inputBytesReleased+=releaseInputBuffers(data.lines);
    reply({id:data.id,type:'result',lines,inputBytesReleased,stages:{queueMs,workerMs:performance.now()-arrival},inferenceMs:performance.now()-start,memoryWarning,memoryLoadMs,memoryIndex:indexInfo?{...indexInfo,...memoryMatcher.stats()}:null,...init,pipelineVersion:data.profile==='baseline'||!data.contextVersion?'direct-ctc':CONTEXT_VERSION});
  }catch(error){reply({id:data.id,type:'error',message:error.message||String(error),retrySingleThread:error.retrySingleThread===true});}
  finally{if(!reuse||!returned)releaseInputBuffers(data.lines);}
};

