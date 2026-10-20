// Small opt-in local templates; no extra neural model and no work in pointer handlers.
export const MEMORY_VERSION=1,FW=128,FH=32,FEATURE_BYTES=FW*FH/8,MAX_ENTRIES=200,MAX_SAMPLES=3;
export function checkedLabel(value){
  if(typeof value!=='string')throw Error('记忆文字无效。');
  const label=value.trim();
  if(!label||[...label].length>16||/[\r\n\u0000-\u001f\u007f]/u.test(label))throw Error('请填写 1–16 字的单行正确文字。长句请拆成短词。');
  return label;
}
export function validFeature(f){
  if(!f||!Number.isFinite(f.aspect)||f.aspect<.08||f.aspect>32||!(f.bits instanceof Uint8Array||Array.isArray(f.bits))||f.bits.length!==FEATURE_BYTES)return false;
  let ink=false;for(let i=0;i<FEATURE_BYTES;i++){const value=f.bits[i];if(!Number.isInteger(value)||value<0||value>255)return false;ink ||= value!==0;}return ink;
}
export function featureFromCanvas(canvas,bound){
  const x=Math.max(0,Math.floor(bound.x)),y=Math.max(0,Math.floor(bound.y)),w=Math.min(canvas.width-x,Math.ceil(bound.width)),h=Math.min(canvas.height-y,Math.ceil(bound.height));
  if(w<=0||h<=0)return null;
  const rgba=canvas.getContext('2d').getImageData(x,y,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(rgba[(j*w+i)*4+3]>48){x0=Math.min(x0,i);x1=Math.max(x1,i);y0=Math.min(y0,j);y1=Math.max(y1,j);}
  if(x1<0)return null;
  return featureFromCrop(canvas,x+x0,y+y0,x1-x0+1,y1-y0+1);
}
export function featureFromCrop(canvas,x,y,width,height){
  const target=document.createElement('canvas');target.width=FW;target.height=FH;
  try{const ctx=target.getContext('2d');ctx.drawImage(canvas,x,y,width,height,2,2,FW-4,FH-4);const pixels=ctx.getImageData(0,0,FW,FH).data,bits=new Uint8Array(FEATURE_BYTES);
    for(let i=0;i<FW*FH;i++)if(pixels[i*4+3]>=64)bits[i>>3]|=1<<(i&7);
    const f={aspect:width/height,bits};return validFeature(f)?f:null;
  }finally{target.width=target.height=1;}
}
function compile(f){
  const dist=new Uint8Array(FW*FH),counts=new Uint16Array(8);dist.fill(6);
  for(let i=0;i<dist.length;i++)if((f.bits[i>>3]>>(i&7))&1){dist[i]=0;counts[(i&127)>>>4]++;}
  const offsets=new Uint16Array(9);for(let j=0;j<8;j++)offsets[j+1]=offsets[j]+counts[j];
  const points=new Uint16Array(offsets[8]);counts.set(offsets.subarray(0,8));
  for(let i=0;i<dist.length;i++)if(dist[i]===0)points[counts[(i&127)>>>4]++]=i;
  for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const i=y*FW+x;if(x)dist[i]=Math.min(dist[i],dist[i-1]+1);if(y)dist[i]=Math.min(dist[i],dist[i-FW]+1);}
  for(let y=FH-1;y>=0;y--)for(let x=FW-1;x>=0;x--){const i=y*FW+x;if(x<FW-1)dist[i]=Math.min(dist[i],dist[i+1]+1);if(y<FH-1)dist[i]=Math.min(dist[i],dist[i+FW]+1);}
  const packed=new Uint8Array(FW*FH/2);for(let i=0;i<dist.length;i++)packed[i>>1]|=Math.min(4,dist[i])<<((i&1)*4);
  return {dist:packed,points,offsets,aspect:f.aspect};
}
function directed(points,dist,dx=0,dy=0,start=0,end=points.length){let sum=0;for(let j=start;j<end;j++){const i=points[j],x=(i&127)+dx,y=(i>>>7)+dy;sum+=x<0||x>=FW||y<0||y>=FH?4:(dist[(y*FW+x)>>1]>>(((y*FW+x)&1)*4))&15;}return end>start?sum/(end-start):4;}
function compiledScore(a,b){
  const ratio=Math.abs(Math.log(a.aspect/b.aspect));if(ratio>.3)return 0;let distance=Infinity;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)distance=Math.min(distance,(directed(a.points,b.dist,dx,dy)+directed(b.points,a.dist,-dx,-dy))/4+(Math.abs(dx)+Math.abs(dy))*.004);
  return Math.max(0,1-distance-ratio*.16);
}
export function featureScore(a,b){
  if(!validFeature(a)||!validFeature(b))return 0;
  return compiledScore(compile(a),compile(b));
}
function elasticScore(a,b){
  // Only vertical baseline variation inside 16px strips; no horizontal stretching,
  // insertion or character reordering. Used only for low-confidence model candidates.
  let best=Infinity;
  for(let dx=-1;dx<=1;dx++){let total=0;for(let j=0;j<8;j++){const a0=a.offsets[j],a1=a.offsets[j+1],b0=b.offsets[j],b1=b.offsets[j+1],count=a1-a0+b1-b0;if(!count)continue;let local=Infinity;for(let dy=-2;dy<=2;dy++){const d=(directed(a.points,b.dist,dx,dy,a0,a1)*(a1-a0)+directed(b.points,a.dist,-dx,-dy,b0,b1)*(b1-b0))/count;local=Math.min(local,d+Math.abs(dy)*.012);}total+=local*count;}best=Math.min(best,total/(a.points.length+b.points.length)/2+Math.abs(dx)*.004);}
  return Math.max(0,1-best-Math.abs(Math.log(a.aspect/b.aspect))*.16);
}
export function featureDiagnostics(a,b){if(!validFeature(a)||!validFeature(b))return null;const x=compile(a),y=compile(b);return {global:compiledScore(x,y),baseline:elasticScore(x,y)};}
export function createMemoryMatcher(){
  const cache=new Map();let builds=0,lastEntries,index;const row=new Uint8Array(65);
  const prepare=f=>{let value=cache.get(f);if(value){cache.delete(f);cache.set(f,value);return value;}value=compile(f);builds++;if(cache.size>=36)cache.delete(cache.keys().next().value);cache.set(f,value);return value;};
  return {match:(feature,line,entries)=>{if(entries!==lastEntries){lastEntries=entries;index=makeLexicon(entries);}return matchMemory(feature,line,entries,prepare,index,row);},clear:()=>{cache.clear();builds=0;lastEntries=index=null;},stats:()=>({compiledSamples:cache.size,builds,compiledBytes:[...cache.values()].reduce((n,f)=>n+f.dist.byteLength+f.points.byteLength+f.offsets.byteLength,0)})};
}
// Keep literal digits AND operator/range sequence unchanged. Missing digits do not
// authorize filling them from a remembered phrase. Letter/digit corrections remain
// the context pipeline's responsibility, before this conservative guard.
export function numberSignature(text){return String(text).normalize('NFKC').match(/[0-9]+(?:\.[0-9]+)?|[+\-−—–~至、:：%/×÷=]/gu)||[];}
const signature=text=>{const normalized=String(text).normalize('NFKC'),hasRole=/[页题课节章段]/u.test(normalized);return JSON.stringify({numbers:numberSignature(text),roles:/[0-9]/u.test(normalized)?normalized.match(/[Pp第页题课节章段]|[0-9]+(?:\.[0-9]+)?/gu)||[]:[],written:hasRole?normalized.match(/[零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟]+|[IVXLCDM]+/gu)||[]:[],roman:normalized.match(/\b(?:Unit|unit|UNIT)\s*[IVXLCDM]+\b|\b[Pp]\s*[IVXLCDM]+\b/gu)||[]});};
function makeLexicon(entries){return Array.isArray(entries)&&entries.length<=MAX_ENTRIES?entries.filter(e=>e&&e.enabled!==false&&typeof e.label==='string'&&e.label.length<=32&&[...e.label].length<=16&&Array.isArray(e.samples)).map(entry=>({entry,chars:[...entry.label.replace(/\s/gu,'')],signature:signature(entry.label)})):[];}
function plausible(a,b,row){
  if(!b.length||Math.abs(a.length-b.length)>1)return false;
  const limit=Math.max(1,Math.floor(a.length*.4));for(let j=0;j<=b.length;j++)row[j]=j;
  for(let i=1;i<=a.length;i++){let diagonal=row[0],minimum=i;row[0]=i;for(let j=1;j<=b.length;j++){const above=row[j];row[j]=Math.min(row[j-1]+1,above+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=above;minimum=Math.min(minimum,row[j]);}if(minimum>limit)return false;}
  return row[b.length]<=limit;
}
function supported(label,line,possibilities){
  if(possibilities.includes(label))return true;
  if(line.text!==line.modelText||!Array.isArray(line.uncertainPositions))return false;
  const a=[...label],b=[...line.text];if(a.length!==b.length)return false;const changed=[];for(let i=0;i<a.length;i++)if(a[i]!==b[i])changed.push(i);
  return changed.length===1&&line.uncertainPositions.includes(changed[0]);
}
export function matchMemory(feature,line,entries,prepare=compile,index=makeLexicon(entries),row=new Uint8Array(65)){
  const start=performance.now(),unchanged=(memoryAlternatives=[])=>({text:line.text,memory:null,memoryAlternatives,memoryMs:performance.now()-start});
  if(!validFeature(feature)||!Array.isArray(entries)||entries.length>MAX_ENTRIES)return unchanged();
  const possibilities=[...new Set([line.text,line.modelText,...(line.candidates||[])].filter(t=>typeof t==='string'&&t.length<=64))];
  // Never choose just the closest label. Include all plausible rivals in the margin
  // test; a rival's different numbers must prevent a false confident correction.
  const options=possibilities.map(t=>[...t.replace(/\s/gu,'')]),literalSignature=signature(line.text),shortlist=[];
  for(const {entry,chars,signature:entrySignature} of index){if(!options.some(t=>plausible(chars,t,row)))continue;for(const f of entry.samples.slice(0,MAX_SAMPLES)){if(!validFeature(f))continue;const ratio=Math.abs(Math.log(feature.aspect/f.aspect));if(ratio<=.3)shortlist.push({entry,f,ratio,signature:entrySignature});}}
  // If there are too many plausible templates, abstain instead of hiding a rival.
  if(!shortlist.length||shortlist.length>36)return unchanged();
  shortlist.sort((a,b)=>a.ratio-b.ratio);
  const query=compile(feature),scored=new Map();for(const {entry,f,signature:entrySignature} of shortlist){const score=compiledScore(query,prepare(f));let candidate=scored.get(entry.label);if(!candidate){candidate={label:entry.label,id:entry.id,score,base:score,signature:entrySignature,samples:[]};scored.set(entry.label,candidate);}candidate.samples.push({f,score});if(score>candidate.score)candidate.score=candidate.base=score;}
  for(const candidate of scored.values())candidate.globalScore=candidate.score;
  const refinable=[...scored.values()].filter(e=>e.label!==line.text&&supported(e.label,line,possibilities)&&e.base>=.8&&e.base<.91);
  if(Number.isFinite(line.score)&&line.score<.97&&refinable.length>0&&refinable.length<=2){
    // Use every taught writing (max 3), and give competing labels the same local
    // alignment when testing ambiguity. Rival-only evidence may block, never apply.
    for(const candidate of scored.values()){if(candidate.base<.8)continue;for(const sample of candidate.samples){if(sample.score<.8)continue;const refined=elasticScore(query,prepare(sample.f));if(refined>=.92&&refined>candidate.score){candidate.score=refined;candidate.base=sample.score;candidate.elastic=true;candidate.rivalOnly=!refinable.includes(candidate);}}}
  }
  const ranked=[...scored.values()].sort((a,b)=>b.score-a.score);
  // A competitor improved only for the ambiguity check still keeps its ordinary
  // global evidence; do not accidentally revoke a previously valid global match.
  const automatic=ranked.map(e=>e.rivalOnly?{...e,score:e.globalScore,base:e.globalScore,elastic:false}:e).sort((a,b)=>b.score-a.score),best=automatic[0],second=ranked.find(e=>e.label!==best?.label);
  const alternatives=ranked.filter(e=>e.score>=.82&&e.signature===literalSignature&&e.label!==line.text).slice(0,2).map(e=>e.label);
  // A visually close template must not overwrite a confident, distinct reading
  // (e.g. genuinely written 涼 versus learned 凉). Uncertain supported candidates
  // can still be resolved automatically; high-confidence disagreements are choices.
  if(Number.isFinite(line.score)&&line.score>=.97&&best&&!possibilities.includes(best.label))return unchanged(alternatives);
  if(!best||best.score<.91||second&&best.score-second.score<(best.elastic?.05:.035)||best.signature!==literalSignature||best.label===line.text)return unchanged(alternatives);
  return {text:best.label,memory:{entryId:best.id,label:best.label,before:line.text,score:best.score,baseScore:best.base,method:best.elastic?'bounded-baseline':'global',version:MEMORY_VERSION},memoryAlternatives:alternatives.filter(t=>t!==best.label),memoryMs:performance.now()-start};
}
