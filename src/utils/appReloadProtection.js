const blockers = new Set();

export function registerAppReloadBlocker(check) {
  blockers.add(check);
  return () => blockers.delete(check);
}

export function appReloadBlockReason() {
  for (const check of blockers) {
    try {
      const reason = check();
      if (reason) return typeof reason === "string" ? reason : "当前正在编辑或保存，请完成后再刷新。";
    } catch {
      return "暂时无法确认编辑内容是否已保存，请稍后重试刷新。";
    }
  }
  return "";
}

export function requestAppReload(location = globalThis.location) {
  const reason = appReloadBlockReason();
  if (reason) return reason;
  location?.reload?.();
  return "";
}

export function installAppReloadProtection(windowRef = window) {
  const beforeUnload = event => {
    if (!appReloadBlockReason()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  windowRef.addEventListener("beforeunload", beforeUnload);
  return () => windowRef.removeEventListener("beforeunload", beforeUnload);
}
