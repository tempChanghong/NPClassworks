const DEVELOPMENT_ONLY_PATHS = new Set([
  "/debug",
  "/debug-init",
  "/debug-socket",
  "/socket-debugger",
]);

const LEGACY_CLASSWORKS_PATHS = new Set([
  "/authorize",
  "/authorizecallback",
  "/CacheManagement",
  "/cses2wakeup",
  "/list",
]);

export function isDevelopmentOnlyPath(path) {
  const normalizedPath = typeof path === "string" ? path.replace(/\/+$/, "") || "/" : "";
  return DEVELOPMENT_ONLY_PATHS.has(normalizedPath) || normalizedPath.startsWith("/debug/");
}

export function isLegacyClassworksPath(path) {
  const normalizedPath = typeof path === "string" ? path.replace(/\/+$/, "") || "/" : "";
  return LEGACY_CLASSWORKS_PATHS.has(normalizedPath) || normalizedPath.startsWith("/list/");
}
