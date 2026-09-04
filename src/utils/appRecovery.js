import {reactive, readonly} from "vue";

const RESOURCE_CACHE_PATTERN = /(workbox|precache|assets-cache|pwa-cache|other-resources|sound-cache|uaf-cache|^(?:js|css|html|images|cdn-cgi)-cache$|external-resources)/i;

const recoveryState = reactive({
  visible: false,
  kind: "application",
  title: "页面遇到问题",
  message: "可以重新加载页面；如果问题仍然存在，请清理资源缓存后重试。",
  detail: "",
  occurredAt: "",
});

export const appRecoveryState = readonly(recoveryState);

export function isApplicationResourceCache(name) {
  return RESOURCE_CACHE_PATTERN.test(String(name || ""));
}

export function showAppRecovery({kind = "application", title, message, detail} = {}) {
  recoveryState.kind = kind;
  recoveryState.title = title || (kind === "resource" ? "新版页面资源载入失败" : "页面遇到问题");
  recoveryState.message = message || "可以重新加载页面；如果问题仍然存在，请清理资源缓存后重试。";
  recoveryState.detail = String(detail || "").slice(0, 500);
  recoveryState.occurredAt = new Date().toISOString();
  recoveryState.visible = true;
}

export function dismissAppRecovery() {
  recoveryState.visible = false;
}

export async function clearApplicationResourceCaches(cacheStorage = globalThis.caches) {
  if (!cacheStorage?.keys || !cacheStorage?.delete) return [];
  const names = await cacheStorage.keys();
  const targets = names.filter(isApplicationResourceCache);
  await Promise.all(targets.map((name) => cacheStorage.delete(name)));
  return targets;
}

export function reloadApplication(location = globalThis.location) {
  location?.reload?.();
}

export async function clearResourcesAndReload({cacheStorage = globalThis.caches, location = globalThis.location} = {}) {
  const cleared = await clearApplicationResourceCaches(cacheStorage);
  reloadApplication(location);
  return cleared;
}
