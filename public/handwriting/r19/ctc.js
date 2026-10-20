// Bounded prefix beam search over model probabilities, with no word list,
// homework templates or reference-answer input. Confidence is not accuracy.
const logAdd=(a,b)=>a===-Infinity?b:b===-Infinity?a:Math.max(a,b)+Math.log1p(Math.exp(-Math.abs(a-b)));
const logProbability=x=>x>0?Math.log(x):-Infinity;
export const isConfusable=(a,b)=>a!==b&&a.length===1&&b.length===1&&['0Oo','1Il|','2Zz','5Ss','68'].some(group=>group.includes(a)&&group.includes(b));
export function decodeTopK(indices,scores,blank,steps,k,characters,{beamWidth=8}={}){
  if(!Number.isInteger(steps)||steps<1||steps>192||k!==5||indices.length!==steps*k||scores.length!==steps*k||blank.length!==steps)throw Error('识别候选尺寸无效。');
  let beams=[{node:null,key:'',pb:0,pnb:-Infinity,total:0}],previous=-1,text='',sum=0,tokens=[];
  const idsAt=new Int32Array(k);
  for(let t=0;t<steps;t++){
    const next=new Map(),blankLog=logProbability(blank[t]);
    if(!Number.isFinite(blank[t])||blank[t]<0||blank[t]>1)throw Error('识别概率无效。');
    for(let j=0;j<k;j++){
      const id=Number(indices[t*k+j]),score=scores[t*k+j];
      if(!Number.isInteger(id)||id<0||id>=characters.length||!Number.isFinite(score)||score<0||score>1)throw Error('识别候选无效。');
      idsAt[j]=id;
    }
    const best=idsAt[0];
    if(best!==0&&best!==previous){
      const alternatives=[];
      for(let j=1;j<k;j++){const id=idsAt[j];if(id&&id!==best&&(scores[t*k+j]>.03||isConfusable(characters[best],characters[id])&&scores[t*k+j]>.003))alternatives.push({text:characters[id],score:scores[t*k+j]});}
      tokens.push({text:characters[best],score:scores[t*k],alternatives,start:t,end:t});text+=characters[best];sum+=scores[t*k];
    }
    else if(best!==0&&best===previous)tokens.at(-1).end=t;
    previous=best;
    // Share immutable prefix nodes instead of copying all earlier token IDs.
    // Keep insertion order, additions, beam width and stable tie ordering unchanged.
    function get(key,node,id){let entry=next.get(key);if(!entry){entry={node:id===undefined?node:{id,previous:node},key,pb:-Infinity,pnb:-Infinity};next.set(key,entry);}return entry;}
    for(const beam of beams){
      const total=beam.total,unchanged=get(beam.key,beam.node);
      unchanged.pb=logAdd(unchanged.pb,total+blankLog);
      for(let j=0;j<k;j++){
        const id=idsAt[j];if(!id)continue;
        const probability=logProbability(scores[t*k+j]);if(probability===-Infinity)continue;
        if(id===beam.node?.id){
          unchanged.pnb=logAdd(unchanged.pnb,beam.pnb+probability);
          const extended=get(beam.key?beam.key+','+id:String(id),beam.node,id);extended.pnb=logAdd(extended.pnb,beam.pb+probability);
        }else{const extended=get(beam.key?beam.key+','+id:String(id),beam.node,id);extended.pnb=logAdd(extended.pnb,total+probability);}
      }
    }
    beams=[...next.values()];for(const beam of beams)beam.total=logAdd(beam.pb,beam.pnb);
    beams.sort((a,b)=>b.total-a.total);beams=beams.slice(0,Math.max(1,Math.min(8,beamWidth)));
  }
  const ranked=beams.map(beam=>{const parts=[];for(let node=beam.node;node;node=node.previous)parts.push(characters[node.id]);return {text:parts.reverse().join(''),logScore:beam.total};});
  const top=ranked[0]?.logScore??-Infinity;
  const candidates=ranked.filter(x=>x.text&&x.logScore>=top-4).slice(0,3);
  return {text,score:tokens.length?sum/tokens.length:0,tokens,candidates,beamText:ranked[0]?.text??text};
}
