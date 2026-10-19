// Small, deterministic homework-context rules. Never receives a reference answer.
// Substitutions are length preserving; units, punctuation and ranges stay in place.
export const CONTEXT_VERSION='homework-context-2';
const formulas=('H2O H2O2 O2 O3 CO CO2 SO2 SO3 NO NO2 N2O N2O4 N2O5 NaOH KOH Ca(OH)2 Mg(OH)2 Ba(OH)2 Al(OH)3 Na2O Na2O2 MgO CaO CuO Cu2O FeO Fe2O3 Fe3O4 Al2O3 SiO2 Na2CO3 NaHCO3 CaCO3 Na2SO4 H2SO4 HNO3 H3PO4 NaNO3 KMnO4 KClO3 C6H12O6 C12H22O11 C2H5OH CH3COOH C2H6O FeSO4 CuSO4 CoO HCl NaCl KCl CaCl2 MgCl2 BaCl2 CuCl2 FeCl2 FeCl3 AlCl3 NH4Cl AgCl').split(' ');
const formulaKey=text=>text.replace(/[O0o]/g,'0').replace(/[1Il|]/g,'1'),formulaIndex=new Map();
for(const formula of formulas){const key=formulaKey(formula);formulaIndex.set(key,formulaIndex.has(key)?null:formula);}
const elements=new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' '));
const numeric=text=>text.replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
const pageNumeric=text=>numeric(text).replace(/([0-9]+)[一−－](?=([0-9]+))/g,(match,a,b)=>Number(a)<=Number(b)?a+'—':match);
const literalContext=(text,start)=>/编号|代码|代号|标识|字母|字符串|原样/u.test(text.slice(0,start).split(/[，,。；;！？\n]/u).at(-1));
function lastMatch(text,pattern){let end=-1;for(const match of text.matchAll(pattern))end=match.index;return end;}
function chemicalContext(text,start){
  const before=text.slice(0,start),chemistry=lastMatch(before,/化学(?:式)?|分子式|反应式|方程式|化合物|氧化物|电解质/gu),literal=lastMatch(before,/编号|代码|代号|标识|字母|字符串|原样|英语|语文|数学|物理|生物|地理|历史|政治|信息/gu);
  return chemistry>=0&&chemistry>literal;
}
export function normalizeHomeworkText(input){
  if(typeof input!=='string'||input.length>4000)throw Error('语境纠正文本无效。');
  const changes=[],occupied=new Uint8Array(input.length);
  const propose=(start,before,after,reason)=>{
    if(before===after||before.length!==after.length||changes.length>=32)return;
    for(let i=start;i<start+before.length;i++)if(occupied[i])return;
    for(let i=start;i<start+before.length;i++)occupied[i]=1;
    changes.push({start,end:start+before.length,before,after,reason});
  };
  // Explicit page/chapter/question roles, including lists and existing ranges.
  for(const match of input.matchAll(/第\s*([0-9OoIl|]+(?:[.、,，—–~～至到一−－-][0-9OoIl|]+)*)\s*[页题课章节段]/gu)){
    const start=match.index+match[0].indexOf(match[1]);propose(start,match[1],pageNumeric(match[1]),'页码／题号');
  }
  for(const match of input.matchAll(/(?:^|[^A-Za-z0-9_])([Pp]\s*[0-9OoIl|]+(?:[—–~～至到一−－-][0-9OoIl|]+)*)(?![A-Za-z0-9_])/gu)){
    const start=match.index+match[0].indexOf(match[1]);if(literalContext(input,start))continue;propose(start,match[1],match[1][0]+pageNumeric(match[1].slice(1)),'P 页码');
  }
  for(const match of input.matchAll(/(?:^|[^A-Za-z0-9_])(?:Unit|unit)\s+([0-9OoIl|]+)(?![A-Za-z0-9_])/gu)){
    if(!/[0-9Oo]/.test(match[1]))continue;const start=match.index+match[0].lastIndexOf(match[1]);if(literalContext(input,start))continue;propose(start,match[1],numeric(match[1]),'Unit 单元号');
  }
  // Quantities need at least one actual digit AND an explicit measurement unit.
  for(const match of input.matchAll(/(?:^|[^A-Za-z0-9_.])([0-9OoIl|]+(?:\.[0-9OoIl|]+)?)\s*(?:mL|mol|kg|cm|mm|m|L|g|s|V|A|%)(?![A-Za-z0-9_])/gu)){
    if(!/[0-9]/.test(match[1]))continue;
    const start=match.index+match[0].indexOf(match[1]);propose(start,match[1],numeric(match[1]),'数值与单位');
  }
  for(const match of input.matchAll(/(?:^|[^A-Za-z0-9_.])([0-9OoIl|]+(?:\.[0-9OoIl|]+)?)\s*(m[o0][lI1|])(?![A-Za-z0-9_])/gu)){
    const start=match.index+match[0].indexOf(match[1]),unitStart=match.index+match[0].lastIndexOf(match[2]);if(!/[0-9]/.test(match[1])||literalContext(input,start))continue;
    propose(start,match[1],numeric(match[1]),'数值与单位');propose(unitStart,match[2],'mol','物质的量单位');
  }
  for(const match of input.matchAll(/[A-Za-z0-9()]+/g)){
    const before=match[0];if(before.length<2||before.length>24||elements.has(before)||!chemicalContext(input,match.index))continue;
    const after=formulaIndex.get(formulaKey(before));if(!after)continue;
    // Known formulas only. Preserve all characters outside the two ambiguity groups.
    if([...before].some((c,i)=>c!==after[i]&&!['0Oo','1Il|'].some(g=>g.includes(c)&&g.includes(after[i]))))continue;
    propose(match.index,before,after,'常见化学式');
  }
  changes.sort((a,b)=>a.start-b.start);let text=input;
  for(const change of [...changes].reverse())text=text.slice(0,change.start)+change.after+text.slice(change.end);
  return {text,modelText:input,changes,contextVersion:CONTEXT_VERSION};
}
