// Cursor pages use immutable IDs; restore the board's chronological order only
// after all pages arrive. Older APIs still expose total/skip pagination.
export async function completePublicationFeed(fetchPage, {isCurrent = () => true} = {}) {
  const items = new Map();
  const cursors = new Set();
  let params = {limit: 100, afterId: ""};
  let first, last;
  let transition = Infinity;
  for (let pageIndex = 0; pageIndex < 1000; pageIndex++) {
    if (!isCurrent()) throw new Error("作业板上下文已切换，已停止加载");
    const page = await fetchPage(params);
    if (!isCurrent()) throw new Error("作业板上下文已切换，已停止加载");
    if (!Array.isArray(page?.items)) throw new Error("作业板分页响应无效");
    first ||= page;
    last = page;
    for (const item of page.items) {
      if (!item?.id) throw new Error("作业板记录缺少标识");
      const previous = items.get(item.id);
      if (!previous || Number(item.revision || 0) >= Number(previous.revision || 0)) items.set(item.id, item);
    }
    const time = page.nextTransitionAt ? new Date(page.nextTransitionAt).getTime() : NaN;
    if (Number.isFinite(time)) transition = Math.min(transition, time);
    if (Object.hasOwn(page, "nextAfterId")) {
      const cursor = page.nextAfterId;
      if (cursor === null) break;
      if (typeof cursor !== "string" || !cursor || !page.items.length || cursors.has(cursor)) {
        throw new Error("作业板分页未能继续，请重新加载");
      }
      cursors.add(cursor);
      params = {limit: 100, afterId: cursor};
    } else {
      const skip = (params.skip || 0) + page.items.length;
      if (!Number.isFinite(page.total) || skip >= page.total) break;
      if (!page.items.length) throw new Error("作业板内容未完整返回，请重新加载");
      params = {limit: 100, skip};
    }
    if (pageIndex === 999) throw new Error("作业板内容过多，本次未完整加载");
  }
  const now = Date.now();
  const complete = [...items.values()].filter(item => item.type !== "NOTICE" || !item.expiresAt
    || new Date(item.expiresAt).getTime() > now);
  complete.sort((a, b) => new Date(b.publishAt || 0) - new Date(a.publishAt || 0)
    || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) || a.id.localeCompare(b.id));
  return {...last, items: complete, total: complete.length, generatedAt: first.generatedAt,
    nextTransitionAt: Number.isFinite(transition) ? new Date(transition).toISOString() : null};
}
