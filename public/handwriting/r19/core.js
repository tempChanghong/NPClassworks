export const WIDTH=1200, HEIGHT=480, ROWS=3, ROW_HEIGHT=HEIGHT/ROWS;
export const CASES=[
  '完成练习册第12至15页，第6、8题。',
  '数学：P36第1—5题，订正第8题。',
  '背诵第3课，默写20个单词。',
  '物理：完成2.3节习题，明天交。',
  '化学：H2O与CO2，计算0.5 mol。',
  '语文：阅读《故乡》，摘抄200字。',
  '英语：Unit 4，完成第12页。',
  '周测订正：第6题不是第8题，P12—15。'
];
export function editDistance(a,b){
  const x=Array.from(a),y=Array.from(b);let prev=Array.from({length:y.length+1},(_,i)=>i);
  for(let i=1;i<=x.length;i++){const next=[i];for(let j=1;j<=y.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));prev=next;}return prev[y.length];
}
export function evaluate(expected,actual){
  if(!expected)return null;
  if(Array.from(expected).length>4000||Array.from(actual).length>4000)throw new Error('对照文本超过 4000 字，请拆成短句测试。识别文字未改动。');
  const distance=editDistance(expected,actual),length=Array.from(expected).length;
  return {reference:expected,raw:actual,edits:distance,characters:length,cer:distance/length,exact:expected===actual,digitsExact:JSON.stringify(extractNumbers(expected))===JSON.stringify(extractNumbers(actual)),numericNotationExact:JSON.stringify(numericNotation(expected))===JSON.stringify(numericNotation(actual)),expectedNumbers:extractNumbers(expected),actualNumbers:extractNumbers(actual)};
}
export const extractNumbers=text=>String(text).normalize('NFKC').match(/[0-9]+(?:\.[0-9]+)?/g)||[];
export const numericNotation=text=>String(text).normalize('NFKC').match(/[0-9]+(?:\.[0-9]+)?|[+\-−—–~至、，,;；:%/×÷=]/gu)||[];
export function decodeCTC(values,dims,characters){
  const [batch,steps,classes]=dims;
  if(batch!==1||classes!==characters.length||values.length!==steps*classes)throw new Error(`字典与模型不匹配：${classes}/${characters.length}`);
  let text='',previous=-1,sum=0,count=0;
  for(let t=0;t<steps;t++){let best=0,score=-Infinity;for(let k=0;k<classes;k++){const v=values[t*classes+k];if(v>score){score=v;best=k;}}
    if(best!==0&&best!==previous){text+=characters[best];sum+=score;count++;}previous=best;
  }
  return {text,score:count?sum/count:0};
}
export function rowBounds(strokes){
  return Array.from({length:ROWS},(_,row)=>{
    let x0=WIDTH,y0=HEIGHT,x1=0,y1=0,found=false;
    for(const stroke of strokes){if(stroke.row!==row)continue;for(const p of stroke.points){found=true;x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}}
    if(!found)return null;
    const pad=12;
    return {row,x:Math.max(0,x0-pad),y:Math.max(row*ROW_HEIGHT,y0-pad),width:Math.min(WIDTH,x1+pad)-Math.max(0,x0-pad),height:Math.min((row+1)*ROW_HEIGHT,y1+pad)-Math.max(row*ROW_HEIGHT,y0-pad)};
  }).filter(Boolean);
}
export const percentile=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor((s.length-1)*p))];};
export function savedText(text){const content=String(text).trim();if(!content)throw new Error('请先识别或填写需要保存的文字。');return {content,savedAt:new Date().toISOString()};}
export function decodeCTCIndices(indices,scores,characters){
  if(indices.length!==scores.length)throw new Error('识别输出长度不一致。');
  let text='',previous=-1,sum=0,count=0;
  for(let t=0;t<indices.length;t++){
    const best=Number(indices[t]);
    if(!Number.isInteger(best)||best<0||best>=characters.length||!Number.isFinite(scores[t]))throw new Error('识别输出无效。');
    if(best!==0&&best!==previous){text+=characters[best];sum+=scores[t];count++;}previous=best;
  }
  return {text,score:count?sum/count:0};
}
export function readSaved(json){
  const data=JSON.parse(json??'[]');
  if(!Array.isArray(data)||data.some(x=>!x||typeof x.content!=='string'||typeof x.savedAt!=='string'))throw new Error('本地文字数据无法读取，请先导出原始备份，再单独删除；不会覆盖旧数据。');
  return data;
}
export function pushBounded(list,item,limit=2000){list.push(item);if(list.length>limit)list.splice(0,list.length-limit);}
