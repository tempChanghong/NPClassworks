import {registerAppReloadBlocker, appReloadBlockReason} from "./appReloadProtection.js";

const blockers = new WeakMap();

export function registerScreenReloadBlocker(store, isBusy) {
  if (!blockers.has(store)) blockers.set(store, new Set());
  const entries = blockers.get(store);
  entries.add(isBusy);
  const release = registerAppReloadBlocker(() => isBusy() && "大屏正在编辑或保存作业，请完成保存并关闭录入窗口后再刷新。");
  return () => { entries.delete(isBusy); release(); };
}

export function isScreenReloadBlocked(store) {
  if (store.screenSyncing || appReloadBlockReason()) return true;
  return [...(blockers.get(store) || [])].some(check => check());
}
