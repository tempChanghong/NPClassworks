// Image preparation is separate from the pen rendering path. Only called on recognition.
// Baseline is retained for A/B measurements, never selected using the reference answer.
import {alignedInputWidth} from './recognition-limits.js';
export const PROFILES={accurate:{margin:.06,minimum:4,pad:0},baseline:{margin:.12,minimum:8,pad:1}};
export function prepareLine(canvas,bound,profile='accurate',inputPool=null){
  const options=PROFILES[profile];if(!options)throw Error('未知的识别方案。');
  const x=Math.max(0,Math.floor(bound.x)),y=Math.max(0,Math.floor(bound.y));
  const w=Math.min(canvas.width-x,Math.ceil(bound.width)),h=Math.min(canvas.height-y,Math.ceil(bound.height));
  if(w<=0||h<=0)return null;
  const pixels=canvas.getContext('2d').getImageData(x,y,w,h);let x0=w,y0=h,x1=-1,y1=-1;
  // Only each occupied scanline's outermost pixels affect the bounding box.
  // Skip its interior without changing the alpha cutoff or crop geometry.
  for(let py=0;py<h;py++){
    const base=py*w*4+3;let left=0;
    while(left<w&&pixels.data[base+left*4]<=32)left++;
    if(left===w)continue;
    let right=w-1;while(right>left&&pixels.data[base+right*4]<=32)right--;
    x0=Math.min(x0,left);x1=Math.max(x1,right);y0=Math.min(y0,py);y1=py;
  }
  if(x1<0)return null;
  const inkWidth=x1-x0+1,inkHeight=y1-y0+1,padding=Math.max(options.minimum,inkHeight*options.margin);
  const paddedWidth=inkWidth+padding*2,paddedHeight=inkHeight+padding*2;
  const validWidth=Math.min(1536,Math.max(8,Math.ceil(paddedWidth/paddedHeight*48))),width=alignedInputWidth(validWidth);
  const target=document.createElement('canvas');target.width=validWidth;target.height=48;
  try{
    const context=target.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,validWidth,48);
    const scale=Math.min(48/paddedHeight,1536/paddedWidth);
    context.drawImage(canvas,x+x0,y+y0,inkWidth,inkHeight,padding*scale,padding*scale,inkWidth*scale,inkHeight*scale);
    const rgba=context.getImageData(0,0,validWidth,48).data,data=inputPool?inputPool.take(3*48*width):new Float32Array(3*48*width);
    if(options.pad)data.fill(options.pad);
    for(let py=0;py<48;py++)for(let px=0;px<validWidth;px++)for(let channel=0;channel<3;channel++)data[channel*48*width+py*width+px]=rgba[(py*validWidth+px)*4+2-channel]/127.5-1;
    return {row:bound.row,width,data,validWidth,profile};
  }finally{target.width=target.height=1;}
}
