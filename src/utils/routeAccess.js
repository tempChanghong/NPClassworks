const DEVELOPMENT_ONLY_PATHS = new Set([
  "/debug",
  "/socket-debugger",
]);

const RETIRED_CLASSWORKS_PATHS = new Set([
  "/authorize",
  "/authorizecallback",
  "/cachemanagement",
  "/cses2wakeup",
  "/debug-init",
  "/debug-socket",
  "/list",
]);

export function isDevelopmentOnlyPath(path) {
  const normalizedPath = typeof path === "string" ? path.replace(/\/+$/, "") || "/" : "";
  return DEVELOPMENT_ONLY_PATHS.has(normalizedPath) || normalizedPath.startsWith("/debug/");
}

export function isRetiredClassworksPath(path) {
  const normalizedPath = typeof path === "string"
    ? path.replace(/\/+$/, "").toLowerCase() || "/"
    : "";
  return RETIRED_CLASSWORKS_PATHS.has(normalizedPath) || normalizedPath.startsWith("/list/");
}
