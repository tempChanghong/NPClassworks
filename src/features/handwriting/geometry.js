export const WIDTH=1200, HEIGHT=480, ROWS=3, ROW_HEIGHT=HEIGHT/ROWS;
export function rowBounds(strokes){
  return Array.from({length:ROWS},(_,row)=>{
    let x0=WIDTH,y0=HEIGHT,x1=0,y1=0,found=false;
    for(const stroke of strokes){if(stroke.row!==row)continue;for(const p of stroke.points){found=true;x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}}
    if(!found)return null;
    const pad=12;
    return {row,x:Math.max(0,x0-pad),y:Math.max(row*ROW_HEIGHT,y0-pad),width:Math.min(WIDTH,x1+pad)-Math.max(0,x0-pad),height:Math.min((row+1)*ROW_HEIGHT,y1+pad)-Math.max(row*ROW_HEIGHT,y0-pad)};
  }).filter(Boolean);
}
