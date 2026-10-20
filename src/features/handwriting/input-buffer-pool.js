import { INPUT_HEIGHT, MAX_INPUT_WIDTH } from './recognition-limits.js';
export const INPUT_BUFFER_BYTES = 3 * INPUT_HEIGHT * MAX_INPUT_WIDTH * 4;
export class InputBufferPool {
  constructor() { this.clear(); }
  take(floatLength) {
    if (!Number.isInteger(floatLength) || floatLength < 1 || floatLength * 4 > INPUT_BUFFER_BYTES || this.borrowed.size >= 3) throw Error('识别输入缓冲尺寸无效。');
    let buffer = this.available.pop();
    if (!buffer) { buffer = new ArrayBuffer(INPUT_BUFFER_BYTES); this.allocations++; }
    // Reset the entire capacity, including unused tail bytes. No old row/class
    // pixels may survive into another lease or into model padding.
    new Float32Array(buffer).fill(0);
    this.borrowed.add(buffer);
    return new Float32Array(buffer, 0, floatLength);
  }
  owns(buffer) { return this.borrowed.has(buffer); }
  accept(buffers) {
    if (!Array.isArray(buffers) || buffers.length !== this.borrowed.size || buffers.length > 3 || new Set(buffers).size !== buffers.length || buffers.some(b => !(b instanceof ArrayBuffer) || b.byteLength !== INPUT_BUFFER_BYTES)) throw Error('识别输入缓冲归还异常，请重新打开手写区。');
    if ([...this.borrowed].some(b => b.byteLength !== 0)) throw Error('识别输入缓冲尚未完成转移。');
    this.borrowed.clear(); this.available.push(...buffers); this.returns += buffers.length;
  }
  clear() { this.available = []; this.borrowed = new Set(); this.allocations = 0; this.returns = 0; }
  stats() { return { available: this.available.length, borrowed: this.borrowed.size, allocations: this.allocations, returns: this.returns, retainedCapacity: (this.available.length + this.borrowed.size) * INPUT_BUFFER_BYTES }; }
}
