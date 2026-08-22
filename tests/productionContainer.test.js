import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dockerfile = fs.readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const nginx = fs.readFileSync(new URL("../deploy/nginx.conf", import.meta.url), "utf8");

test("production image builds the PWA and serves only its static output", () => {
  assert.match(dockerfile, /FROM node:22-alpine AS build/);
  assert.match(dockerfile, /ARG VITE_DEFAULT_SERVER_PROVIDER=kv-server/);
  assert.match(dockerfile, /ENV VITE_DEFAULT_SERVER_PROVIDER=\$VITE_DEFAULT_SERVER_PROVIDER/);
  assert.match(dockerfile, /RUN pnpm run build/);
  assert.match(dockerfile, /COPY --from=build \/app\/dist \/usr\/share\/nginx\/html/);
});

test("self-hosted production images select the configured KV server instead of cloud rotation", () => {
  const settings = fs.readFileSync(new URL("../src/utils/settings.js", import.meta.url), "utf8");
  const socketClient = fs.readFileSync(new URL("../src/utils/socketClient.js", import.meta.url), "utf8");
  assert.match(settings, /import\.meta\.env\.VITE_DEFAULT_SERVER_PROVIDER/);
  assert.match(settings, /default:\s*defaultServerProvider/);
  assert.match(settings, /defaultServerProvider === "kv-server"[\s\S]*VITE_DEFAULT_KV_SERVER/);
  assert.match(socketClient, /return cfg \|\| window\.location\.origin/);
  assert.doesNotMatch(socketClient, /return cfg \|\| envUrl/);
});

test("nginx preserves SPA routing and never long-caches the service worker", () => {
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(nginx, /location = \/sw\.js[\s\S]*no-cache, no-store/);
  assert.match(nginx, /location \/assets\/[\s\S]*immutable/);
});
