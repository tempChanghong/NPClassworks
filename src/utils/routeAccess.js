const DEVELOPMENT_ONLY_PATHS = new Set([
  "/debug",
  "/debug-init",
  "/debug-socket",
  "/socket-debugger",
]);

export function isDevelopmentOnlyPath(path) {
  const normalizedPath = typeof path === "string" ? path.replace(/\/+$/, "") || "/" : "";
  return DEVELOPMENT_ONLY_PATHS.has(normalizedPath) || normalizedPath.startsWith("/debug/");
}
