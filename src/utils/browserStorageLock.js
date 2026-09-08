// localStorage read/modify/write must be one operation across same-origin tabs.
// Never pretend an in-memory mutex coordinates independent browser documents.
export function withBrowserStorageLock(name, operation, locks = globalThis.navigator?.locks) {
  if (!locks?.request) {
    return Promise.reject(Object.assign(new Error("当前浏览器不支持安全的跨标签本机保存，请更新浏览器后重试。输入仍在窗口中。"), {
      code: "SCREEN_STORAGE_LOCK_UNAVAILABLE",
    }));
  }
  return locks.request(name, {mode: "exclusive"}, operation);
}
