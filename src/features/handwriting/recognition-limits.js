// Shared preparation/Worker dimensions. Smaller padding was tested and rejected
// because changing sequence context regressed Chinese and CO/Co controls.
export const INPUT_HEIGHT=48,MIN_INPUT_WIDTH=320,MAX_INPUT_WIDTH=1536,WIDTH_ALIGNMENT=32;
export function alignedInputWidth(validWidth){
  if(!Number.isInteger(validWidth)||validWidth<1||validWidth>MAX_INPUT_WIDTH)throw Error('识别图片宽度无效。');
  return Math.max(MIN_INPUT_WIDTH,Math.ceil(validWidth/WIDTH_ALIGNMENT)*WIDTH_ALIGNMENT);
}
export function validInputLine(line){return !!line&&Number.isInteger(line.width)&&line.width>=MIN_INPUT_WIDTH&&line.width<=MAX_INPUT_WIDTH&&line.width%WIDTH_ALIGNMENT===0&&line.data instanceof Float32Array&&line.data.length===3*INPUT_HEIGHT*line.width;}
export function releaseInputBuffers(lines){
  let bytes=0;const seen=new Set();if(!Array.isArray(lines))return bytes;
  for(const line of lines){const buffer=line?.data?.buffer;if(!(buffer instanceof ArrayBuffer)||seen.has(buffer)||typeof buffer.transfer!=='function')continue;seen.add(buffer);const size=buffer.byteLength;try{buffer.transfer(0);bytes+=size;}catch{/* Older or non-detachable buffers keep ordinary GC lifetime. */}}
  return bytes;
}
// Detach only after the last line that shares a transferred buffer has finished.
// The model session remains live; canvas ink and learned features are separate.
export function releaseCompletedInput(lines,index){
  const buffer=lines[index]?.data?.buffer;if(!(buffer instanceof ArrayBuffer))return 0;
  for(let i=index+1;i<lines.length;i++)if(lines[i]?.data?.buffer===buffer)return 0;
  return releaseInputBuffers([lines[index]]);
}
