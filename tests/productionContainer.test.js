import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dockerfile = fs.readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const nginx = fs.readFileSync(new URL("../deploy/nginx.conf", import.meta.url), "utf8");

test("production image builds the PWA and serves only its static output", () => {
  assert.match(dockerfile, /FROM node:22-alpine AS build/);
  assert.match(dockerfile, /RUN pnpm run build/);
  assert.match(dockerfile, /COPY --from=build \/app\/dist \/usr\/share\/nginx\/html/);
});

test("nginx preserves SPA routing and never long-caches the service worker", () => {
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(nginx, /location = \/sw\.js[\s\S]*no-cache, no-store/);
  assert.match(nginx, /location \/assets\/[\s\S]*immutable/);
});
