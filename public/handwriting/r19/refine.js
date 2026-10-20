// Selective local re-reads use only pixels and CTC alignment. No answer/word list.
const range=/[-—–~～]/u;
export function compatibleEdit(before,after){
  if(before===after)return false;
  const a=[...before],b=[...after];
  if(a.length===b.length&&a.every((c,i)=>c===b[i]||['0Oo','1Il|'].some(g=>g.includes(c)&&g.includes(b[i]))))return true;
  // Accept a symbol candidate only if every letter, digit, decimal and space stays identical.
  return /^[Pp]?\d+(?:[-—–~～]+\d+)*$/u.test(before)&&/^[Pp]?\d+(?:[-—–~～]+\d+)*$/u.test(after)&&before.replace(/[-—–~～]/gu,'')===after.replace(/[-—–~～]/gu,'')&&(range.test(before)||range.test(after));
}
function alignment(a,b){
  const width=b.length+1,d=new Uint16Array((a.length+1)*width);
  for(let i=0;i<=a.length;i++)d[i*width]=i;for(let j=0;j<=b.length;j++)d[j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i*width+j]=Math.min(d[(i-1)*width+j]+1,d[i*width+j-1]+1,d[(i-1)*width+j-1]+Number(a[i-1]!==b[j-1]));
  const map=new Int16Array(a.length).fill(-1);let i=a.length,j=b.length;
  while(i||j){const current=d[i*width+j];if(i&&j&&current===d[(i-1)*width+j-1]+Number(a[i-1]!==b[j-1])){if(a[i-1]===b[j-1])map[i-1]=j-1;i--;j--;}else if(i&&current===d[(i-1)*width+j]+1)i--;else j--;}
  return map;
}
export function planRereads(decoded,line){
  // Only a contiguous, unchanged token can be re-read at its aligned position.
  const map=alignment(decoded.text,decoded.beamText);
  const tokens=decoded.tokens,plans=[];let offset=0;
  const positions=tokens.map(t=>{const start=offset;offset+=t.text.length;return start;});
  for(let i=0;i<tokens.length;i++){
    if(!/^[a-zA-Z0-9|.—–~～-]+$/u.test(tokens[i].text))continue;
    let end=i;while(end+1<tokens.length&&/^[a-zA-Z0-9|.—–~～-]+$/u.test(tokens[end+1].text))end++;
    const text=tokens.slice(i,end+1).map(t=>t.text).join('');
    if(text.length>=2&&text.length<=24&&(/[0Oo1Il|]/u.test(text)&&/[a-zA-Z|]/u.test(text)||range.test(text))){
      const center=t=>(t.start+t.end+1)*4;
      const left=Math.max(0,Math.floor(i?(center(tokens[i-1])+center(tokens[i]))/2:0));
      const right=Math.min(line.validWidth,Math.ceil(end+1<tokens.length?(center(tokens[end])+center(tokens[end+1]))/2:line.validWidth));
      const begin=positions[i],finish=positions[end]+tokens[end].text.length,start=map[begin];
      if(right-left>=5&&start>=0&&Array.from({length:finish-begin},(_,j)=>map[begin+j]===start+j).every(Boolean))plans.push({text,start,end:start+text.length,left,right,priority:Math.max(...tokens.slice(i,end+1).filter(t=>/[0Oo1Il|]/u.test(t.text)).map(t=>1-t.score),0)});
    }
    i=end;
  }
  return plans.sort((a,b)=>b.priority-a.priority||a.start-b.start).slice(0,2);
}
export function cropReread(line,plan){
  const {width,data}=line;let x0=plan.right,y0=48,x1=-1,y1=-1;
  const value=(x,y,c)=>data[c*48*width+y*width+x];
  for(let y=0;y<48;y++)for(let x=plan.left;x<plan.right;x++)if(Math.min(value(x,y,0),value(x,y,1),value(x,y,2))<200/127.5-1){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(x1<0)return null;
  x0=Math.max(plan.left,x0-1);x1=Math.min(plan.right-1,x1+1);y0=Math.max(0,y0-1);y1=Math.min(47,y1+1);
  const w=x1-x0+1,h=y1-y0+1,pad=Math.max(2,h*.08),scale=Math.min(48/(h+pad*2),768/(w+pad*2));
  const validWidth=Math.min(768,Math.ceil((w+pad*2)*scale)),targetWidth=Math.max(320,Math.ceil(validWidth/32)*32),output=new Float32Array(3*48*targetWidth);
  for(let c=0;c<3;c++)for(let y=0;y<48;y++)for(let x=0;x<validWidth;x++){
    const sx=(x+.5)/scale-pad-.5,sy=(y+.5)/scale-pad-.5;let v=1;
    if(sx>=-.5&&sx<w-.5&&sy>=-.5&&sy<h-.5){
      const fx=Math.max(0,Math.min(w-1,sx)),fy=Math.max(0,Math.min(h-1,sy)),ax=Math.floor(fx),ay=Math.floor(fy),bx=Math.min(w-1,ax+1),by=Math.min(h-1,ay+1),dx=fx-ax,dy=fy-ay;
      v=(value(x0+ax,y0+ay,c)*(1-dx)+value(x0+bx,y0+ay,c)*dx)*(1-dy)+(value(x0+ax,y0+by,c)*(1-dx)+value(x0+bx,y0+by,c)*dx)*dy;
    }
    output[c*48*targetWidth+y*targetWidth+x]=v;
  }
  return {data:output,width:targetWidth,validWidth,row:line.row};
}
export function assessReread(plan,decoded){
  const eligible=decoded.candidates.filter(c=>compatibleEdit(plan.text,c.text));
  return {start:plan.start,end:plan.end,text:plan.text,alternatives:eligible.map(c=>c.text).slice(0,3)};
}
export function mergeRereads(primary,reviews){
  const choices=[];
  for(const review of reviews){
    if(primary.slice(review.start,review.end)!==review.text)continue;
    const alternatives=[...new Set(review.alternatives)].filter(s=>s!==review.text);
    if(alternatives.length)choices.push({...review,alternatives,kind:'reread'});
  }
  return {text:primary,choices};
}
export function rangeChoices(primary,candidates){
  const choices=[];
  for(const {text} of candidates){
    if(text===primary)continue;let left=0,tail=0;
    while(left<primary.length&&left<text.length&&primary[left]===text[left])left++;
    while(tail<primary.length-left&&tail<text.length-left&&primary.at(-1-tail)===text.at(-1-tail))tail++;
    let start=left,end=primary.length-tail;
    while(start>0&&/[0-9Pp—–~～-]/u.test(primary[start-1]))start--;
    while(end<primary.length&&/[0-9Pp—–~～-]/u.test(primary[end]))end++;
    const before=primary.slice(start,end),after=text.slice(start,text.length-(primary.length-end));
    if(!compatibleEdit(before,after)||!(range.test(before)||range.test(after)))continue;
    let choice=choices.find(c=>c.start===start&&c.end===end);
    if(!choice){choice={start,end,text:before,alternatives:[],kind:'range'};choices.push(choice);}
    if(!choice.alternatives.includes(after))choice.alternatives.push(after);
  }
  return choices.slice(0,4);
}
export function characterChoices(text){
  const choices=[];let start=0;
  for(const char of text){
    const group=['0Oo','1Il|'].find(g=>g.includes(char));
    if(group)choices.push({start,end:start+char.length,text:char,alternatives:[...group].filter(c=>c!==char),kind:'character'});
    start+=char.length;
  }
  return choices.slice(0,12);
}
