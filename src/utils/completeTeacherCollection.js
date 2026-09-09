// Teacher management filters and counts operate on a complete collection.
// Keep partial pages private so a failed refresh never replaces known data.
export async function completeTeacherCollection(fetchPage, {isCurrent = () => true} = {}) {
  const items = [];
  const ids = new Set();
  let expectedTotal;
  let summary;
  for (let pageIndex = 0; pageIndex < 1000; pageIndex++) {
    if (!isCurrent()) return null;
    let page;
    try {
      page = await fetchPage({limit: 100, skip: items.length});
    } catch (error) {
      if (!isCurrent()) return null;
      throw error;
    }
    if (!isCurrent()) return null;
    if (!Array.isArray(page?.items)) throw new Error("教师列表返回异常，请重新刷新");
    if (page.total !== undefined && (!Number.isInteger(page.total) || page.total < 0)) {
      throw new Error("教师列表总数异常，请重新刷新");
    }
    if (pageIndex === 0) {
      expectedTotal = page.total;
      summary = JSON.stringify(page.summary);
    } else if (page.total !== expectedTotal || JSON.stringify(page.summary) !== summary) {
      throw new Error("教师列表在加载期间发生变化，请重新刷新");
    }
    for (const item of page.items) {
      if (!item?.id || ids.has(item.id)) throw new Error("教师列表分页发生重复或缺失，请重新刷新");
      ids.add(item.id);
      items.push(item);
    }
    // Some older endpoints return an unpaginated collection without a total.
    if (expectedTotal === undefined || items.length === expectedTotal) {
      return {...page, items, total: items.length, skip: 0, limit: items.length};
    }
    if (!page.items.length || items.length > expectedTotal) throw new Error("教师列表未完整返回，请重新刷新");
  }
  throw new Error("教师列表过大，本次未完整加载，请稍后重试");
}
