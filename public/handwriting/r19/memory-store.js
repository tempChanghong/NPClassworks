import {MEMORY_VERSION,MAX_ENTRIES,MAX_SAMPLES,checkedLabel,validFeature} from './handwriting-memory.js';
const DB='handwriting-lab-memory-v1';
export const MAX_IMPORT_BYTES=2*1024*1024;
let opening;
function open(){
  if(opening)return opening;
  let resolve,reject,blocked=false,request;
  const attempt=new Promise((ok,no)=>{resolve=ok;reject=no;});opening=attempt;
  // An old close/error event must not invalidate a newer successful connection.
  const invalidate=()=>{if(opening===attempt)opening=null;};
  try{request=indexedDB.open(DB,2);}catch{invalidate();reject(Error('无法打开本机手写记忆；本次仍可普通识别。'));return attempt;}
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('entries'))db.createObjectStore('entries',{keyPath:'label'});if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings');request.transaction.objectStore('settings').put(0,'revision');};
  request.onerror=()=>{invalidate();reject(Error('无法打开本机手写记忆；本次仍可普通识别。'));};
  request.onblocked=()=>{blocked=true;invalidate();reject(Error('记忆存储被旧窗口占用，请关闭旧窗口重试；已有记忆保留。'));};
  request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onclose=invalidate;db.onversionchange=()=>{db.close();invalidate();};resolve(db);};
  return attempt;
}
function validSamples(samples){if(!Array.isArray(samples)||samples.length<1||samples.length>MAX_SAMPLES)return false;for(const f of samples)if(!validFeature(f))return false;return true;}
function checkedEntries(entries){
  if(!Array.isArray(entries)||entries.length>MAX_ENTRIES)throw Error('记忆数量超过上限或数据损坏，未覆盖原记录。');
  const labels=new Set();for(const e of entries){if(!e||checkedLabel(e.label)!==e.label||labels.has(e.label)||typeof e.id!=='string'||e.id.length>100||typeof e.enabled!=='boolean'||!validSamples(e.samples))throw Error('记忆数据无效，未覆盖原记录。');labels.add(e.label);}
  return entries;
}
export async function readMemory(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['entries','settings']),all=tx.objectStore('entries').getAll(),enabled=tx.objectStore('settings').get('enabled');tx.oncomplete=()=>{try{resolve({entries:checkedEntries(all.result),enabled:enabled.result!==false});}catch(e){reject(e);}};tx.onabort=tx.onerror=()=>reject(Error('读取手写记忆失败，本次使用普通识别。'));});}
export async function readMemorySummary(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['entries','settings']),count=tx.objectStore('entries').count(),enabled=tx.objectStore('settings').get('enabled');tx.oncomplete=()=>resolve({count:count.result,enabled:enabled.result!==false});tx.onabort=tx.onerror=()=>reject(Error('读取手写记忆概况失败。'));});}
// UI lists need labels/counts, not all 600 feature payloads. Retain only metadata;
// revision reads and a single cursor transaction cover concurrent search requests.
export function createMemoryListReader(){
  let cached=null,cachedDb=null,pending=null,loads=0;
  return {read:async()=>{
    const db=await open();if(pending?.db===db)return pending.promise;
    const attempt={db};pending=attempt;
    attempt.promise=new Promise((resolve,reject)=>{
      const tx=db.transaction(['entries','settings']),store=tx.objectStore('entries'),settings=tx.objectStore('settings');
      const revision=settings.get('revision'),enabled=settings.get('enabled');let entries=null,reused=null,failure;
      revision.onsuccess=()=>{try{
        const rev=revision.result;if(!Number.isSafeInteger(rev)||rev<0)throw Error('记忆版本记录无效，请保留原数据。');
        if(cachedDb===db&&cached?.revision===rev){reused=cached;return;}
        entries=[];const cursor=store.openCursor();
        cursor.onsuccess=()=>{try{const item=cursor.result;if(!item)return;
          if(entries.length>=MAX_ENTRIES)throw Error('记忆数量超过上限或数据损坏，请保留原记录。');
          const e=checkedEntries([item.value])[0];entries.push({label:e.label,enabled:e.enabled,sampleCount:e.samples.length});item.continue();
        }catch(error){failure=error;tx.abort();}};
      }catch(error){failure=error;tx.abort();}};
      tx.oncomplete=()=>{const snapshot=entries?{revision:revision.result,entries}:reused;
        if(entries&&pending===attempt){cached=snapshot;cachedDb=db;loads++;}
        resolve({...snapshot,enabled:enabled.result!==false,reloaded:entries!==null,loads});};
      tx.onabort=tx.onerror=()=>reject(failure||Error('读取手写记忆列表失败；原记录保留。'));
    }).catch(error=>{if(pending===attempt)cached=cachedDb=null;throw error;}).finally(()=>{if(pending===attempt)pending=null;});
    return attempt.promise;
  }};
}
let listReader;
export async function readMemoryList(){return (listReader??=createMemoryListReader()).read();}
export function createMemoryReader(){
  let cached=null,cachedDb=null,loads=0;
  return {clear:()=>{cached=cachedDb=null;},read:async()=>{
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction(['entries','settings']),settings=tx.objectStore('settings'),revision=settings.get('revision'),enabled=settings.get('enabled');let records;
      enabled.onsuccess=()=>{if(enabled.result!==false&&(cachedDb!==db||!cached?.enabled||cached.revision!==revision.result))records=tx.objectStore('entries').getAll();};
      tx.oncomplete=()=>{try{
        const rev=revision.result;if(!Number.isSafeInteger(rev)||rev<0)throw Error('记忆版本记录无效，本次使用普通识别。');
        const reloaded=!!records;
        if(enabled.result===false)cached={revision:rev,enabled:false,entries:[]};
        else if(records){cached={revision:rev,enabled:true,entries:checkedEntries(records.result)};loads++;}
        if(!cached||!cached.enabled&&enabled.result!==false)throw Error('记忆状态不一致，本次使用普通识别。');
        cachedDb=db;resolve({...cached,reloaded,loads});
      }catch(error){cached=cachedDb=null;reject(error);}};
      tx.onabort=tx.onerror=()=>{cached=cachedDb=null;reject(Error('读取手写记忆失败，本次使用普通识别。'));};
    });
  }};
}
function same(a,b){return Math.abs(a.aspect-b.aspect)<.000001&&a.bits.every((v,i)=>v===b.bits[i]);}
function nextRevision(value){if(!Number.isSafeInteger(value)||value<0||value>=Number.MAX_SAFE_INTEGER)throw Error('记忆版本记录无效，未修改原记录。');return value+1;}
// Read/validate/write in one transaction: competing tabs cannot silently exceed
// the limits or overwrite one another's additional samples.
async function change(update){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['entries','settings'],'readwrite'),store=tx.objectStore('entries'),settings=tx.objectStore('settings'),revision=settings.get('revision'),request=store.getAll();let result,failure;request.onsuccess=()=>{try{const entries=checkedEntries(request.result);result=update(entries,store,settings);settings.put(nextRevision(revision.result),'revision');}catch(e){failure=e;tx.abort();}};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(failure||Error('手写记忆未保存，请检查本机存储空间；原记录保留。'));});}
// Ordinary edits read only the target and count, never clone all 600 features.
async function changeOne(label,update){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['entries','settings'],'readwrite'),store=tx.objectStore('entries'),settings=tx.objectStore('settings'),revision=settings.get('revision'),item=store.get(label),count=store.count();let result,failure;count.onsuccess=()=>{try{if(item.result)checkedEntries([item.result]);result=update(item.result,count.result,store,settings);settings.put(nextRevision(revision.result),'revision');}catch(e){failure=e;tx.abort();}};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(failure||Error('手写记忆未保存，请检查本机存储空间；原记录保留。'));});}
export function remember(label,feature){label=checkedLabel(label);if(!validFeature(feature))throw Error('请先写下有效笔迹。');feature={aspect:feature.aspect,bits:new Uint8Array(feature.bits)};return changeOne(label,(e,count,store)=>{if(e){if(e.samples.some(f=>same(f,feature)))throw Error('这份笔迹已记住，请重新书写再补充样本。');if(e.samples.length>=MAX_SAMPLES)throw Error('这段文字已有 3 份写法。需要重学时请先删除该条。');e.samples.push(feature);}else{if(count>=MAX_ENTRIES)throw Error('已达 200 条记忆，请先删除不需要的条目。');e={label,id:crypto.randomUUID(),enabled:true,samples:[feature],createdAt:new Date().toISOString()};}store.put(e);return e.samples.length;});}
export function deleteMemory(label){return changeOne(label,(_,__,store)=>store.delete(label));}
export function setMemoryEnabled(enabled){return changeOne('',(_,__,___,settings)=>settings.put(!!enabled,'enabled'));}
export function setEntryEnabled(label,enabled){return changeOne(label,(e,_,store)=>{if(!e)throw Error('记忆已被其他窗口删除，请刷新列表。');e.enabled=!!enabled;store.put(e);});}
export function exportMemory(entries){checkedEntries(entries);return JSON.stringify({kind:'handwriting-lab-memory',version:MEMORY_VERSION,entries:entries.map(e=>({...e,samples:e.samples.map(f=>({aspect:f.aspect,bits:Array.from(f.bits)}))}))});}
export function importMemory(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_IMPORT_BYTES)throw Error('记忆文件过大，上限 2 MiB。');
  const data=JSON.parse(text);if(data?.kind!=='handwriting-lab-memory'||data.version!==MEMORY_VERSION)throw Error('记忆文件类型或版本不兼容。');
  const incoming=checkedEntries(data.entries);
  return change((entries,store)=>{const merged=new Map(entries.map(e=>[e.label,e]));let added=0;for(const item of incoming){let e=merged.get(item.label);if(!e){e={label:item.label,id:crypto.randomUUID(),enabled:item.enabled,createdAt:new Date().toISOString(),samples:[]};merged.set(item.label,e);}for(const f of item.samples){const feature={aspect:f.aspect,bits:new Uint8Array(f.bits)};if(e.samples.some(s=>same(s,feature)))continue;if(e.samples.length>=MAX_SAMPLES)throw Error(`“${e.label}”合并后超过 3 份写法，未导入任何条目。`);e.samples.push(feature);added++;}}if(merged.size>MAX_ENTRIES)throw Error('合并后超过 200 条，未导入任何条目。');for(const e of merged.values())store.put(e);return added;});
}

