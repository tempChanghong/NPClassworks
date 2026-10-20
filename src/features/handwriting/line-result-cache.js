// At most three plain-text result objects; no ink, image or tensor buffers.
// r14 recognizes each row independently and this integration disables learning.
// Any future cross-row context or personal-memory revision must reset this cache.
export class LineResultCache {
  constructor() { this.entries = new Map(); this.epoch = 0; }
  reset() { this.entries.clear(); this.epoch++; }
  plan(bounds, revisions) {
    const rows = new Set(bounds.map(b => b.row));
    if (rows.size !== bounds.length || bounds.length > 3 || [...rows].some(row => !Number.isInteger(row) || row < 0 || row > 2)) throw Error("手写行范围无效。");
    for (const row of this.entries.keys()) if (!rows.has(row)) this.entries.delete(row);
    return {epoch: this.epoch, bounds: bounds.map(bound => ({...bound})), revisions: revisions.slice(), missing: bounds.filter(b => this.entries.get(b.row)?.revision !== revisions[b.row])};
  }
  finish(plan, inferred) {
    if (plan.epoch !== this.epoch) throw Error("笔迹已变化，请重新识别。");
    const expected = new Set(plan.missing.map(b => b.row));
    if (inferred.length !== expected.size || inferred.some(row => !expected.delete(row.row)) || expected.size) throw Error("识别行结果不完整，请重试。笔迹保留。");
    for (const line of inferred) this.entries.set(line.row, {revision: plan.revisions[line.row], line: {
      row: line.row, text: line.text, modelText: line.modelText, candidates: (line.candidates || []).slice(),
    }});
    const fresh = new Map(inferred.map(line => [line.row, line]));
    return plan.bounds.map(bound => {
      const entry = this.entries.get(bound.row);
      if (!entry || entry.revision !== plan.revisions[bound.row]) throw Error("笔迹已变化，请重新识别。");
      return fresh.has(bound.row) ? {...fresh.get(bound.row), reused: false} : {...entry.line, reused: true, modelMs: 0, decodeMs: 0, contextMs: 0, memoryMs: 0};
    });
  }
}
