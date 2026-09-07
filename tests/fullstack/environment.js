import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {api, origin} from "../e2e/environment.js";

export const backendRoot = resolve(process.env.CLASSWORKS_BACKEND_ROOT || "../NPClassworksKV");
export const backendModule = path => import(pathToFileURL(resolve(backendRoot, path)).href);

export function databaseUrl(value) {
  if (!value) throw new Error("FULLSTACK_DATABASE_URL must explicitly name a disposable database");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !/^\/npclassworks_test_fullstack(?:_[a-z0-9_]+)?$/.test(url.pathname) ||
      [...url.searchParams.keys()].some(key => key !== "schema") ||
      url.searchParams.getAll("schema").length > 1 ||
      (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")) {
    throw new Error("Fullstack tests require a loopback npclassworks_test_fullstack database with no connection overrides");
  }
  return url.href;
}

// Apply before importing any backend module; ignore ambient production credentials.
export function configureRuntime() {
  process.env.DATABASE_URL = databaseUrl(process.env.FULLSTACK_DATABASE_URL);
  Object.assign(process.env, {
    NODE_ENV: "test", TZ: "Asia/Shanghai", JWT_ALG: "HS256",
    JWT_SECRET: "fullstack-disposable-access-secret-at-least-32-characters",
    REFRESH_TOKEN_SECRET: "fullstack-disposable-refresh-secret-at-least-32-characters",
    ACCESS_TOKEN_EXPIRES_IN: "15m", REFRESH_TOKEN_EXPIRES_IN: "1d",
    BOOTSTRAP_SETUP_KEY: "fullstack-disposable-setup-key-at-least-32-characters",
    FRONTEND_URL: origin, BASE_URL: api, CORS_ALLOWED_ORIGINS: origin,
    AXIOM_TOKEN: "", AXIOM_DATASET: "", TRUST_PROXY: "",
  });
}
