export function seatingImageDimensions(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width, height;
  if (bytes.length >= 24 && bytes.slice(0, 8).every((b, i) => b === [137,80,78,71,13,10,26,10][i])) {
    width = v.getUint32(16); height = v.getUint32(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p++] !== 255) break;
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 217 || marker === 218) break;
      const length = v.getUint16(p);
      if (length < 2 || p + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) {
        height = v.getUint16(p + 3); width = v.getUint16(p + 5); break;
      }
      p += length;
    }
  }
  if (!width || !height || width > 4096 || height > 4096 || width * height > 6000000) throw new Error('图片须为 PNG/JPEG，最长边不超过 4096 像素，总像素不超过 600 万。');
  return {width, height};
}
export async function normalizeSeatingImage(file) {
  if (!file || file.size <= 0 || file.size > 8388608) throw new Error('请选择不超过 8 MiB 的 PNG/JPEG 自习座位表。');
  const bytes = new Uint8Array(await file.arrayBuffer()); seatingImageDimensions(bytes);
  const bitmap = await globalThis.createImageBitmap(file);
  try {
    if (bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width * bitmap.height > 6000000) throw new Error('图片像素过大。');
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    canvas.width = canvas.height = 0;
    if (!blob || blob.size > 2097152) throw new Error('转换后的 PNG 超过 2 MiB，请缩减图片尺寸，保留姓名可读性。');
    const data = await new Promise((resolve, reject) => { const reader = new globalThis.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    return {dataUrl: data, image: data.split(',')[1], width: bitmap.width, height: bitmap.height, byteCount: blob.size};
  } finally { bitmap.close(); }
}
