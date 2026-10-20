#!/usr/bin/env bash
set -euo pipefail

# Exercise the production server block against the built PWA on loopback only.
# Run natively in Linux CI, without Docker, a system config, or production data.
dist=$(realpath "${1:-dist}")
command -v nginx >/dev/null
test -s "$dist/handwriting/r19/assets/ort.wasm.min.mjs"
sandbox=$(mktemp -d)
mkdir -p "$sandbox/logs"
nginx_pid=
cleanup() {
  if [[ -n "$nginx_pid" ]]; then
    kill -TERM "$nginx_pid" 2>/dev/null || true
    wait "$nginx_pid" || true
  fi
}
trap cleanup EXIT

node --input-type=module - "$dist" "$sandbox" <<'NODE'
import {readFileSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
const [dist, sandbox] = process.argv.slice(2);
if (/["\r\n]/.test(dist + sandbox)) throw new Error('Unsupported test directory');
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const site = readFileSync('deploy/nginx.conf', 'utf8')
  .replace('listen 80;', `listen 127.0.0.1:${port};`)
  .replace('root /usr/share/nginx/html;', `root "${dist}";`);
// Deliberately omit mjs from the inherited table: older production images
// return octet-stream unless our actual server block supplies the module type.
writeFileSync(`${sandbox}/nginx.conf`, `
  error_log stderr;
  pid "${sandbox}/nginx.pid";
  events {}
  http {
    access_log off;
    default_type application/octet-stream;
    types {
      text/html html;
      application/javascript js;
      application/json json webmanifest;
      application/wasm wasm;
    }
    ${site}
  }
`);
writeFileSync(`${sandbox}/origin`, `http://127.0.0.1:${port}`);
NODE

nginx -p "$sandbox/" -c "$sandbox/nginx.conf" -e stderr -t
nginx -p "$sandbox/" -c "$sandbox/nginx.conf" -e stderr -g 'daemon off;' &
nginx_pid=$!
origin=$(cat "$sandbox/origin")
for attempt in {1..100}; do
  if curl --silent --fail --head "$origin/index.html" >/dev/null; then break; fi
  kill -0 "$nginx_pid"
  sleep 0.1
done
check_type() {
  local path=$1 expected=$2 headers actual
  headers=$(curl --silent --show-error --fail --head "$origin$path")
  actual=$(printf '%s\n' "$headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type" {print $2}' | cut -d';' -f1)
  [[ "$actual" == "$expected" ]] || { echo "$path: expected $expected, got $actual" >&2; return 1; }
  echo "PASS: $path ($actual)"
}
check_type /index.html text/html
check_type /registerSW.js application/javascript
check_type /handwriting/r19/assets/manifest.json application/json
check_type /handwriting/r19/assets/ort.wasm.min.mjs application/javascript
check_type /handwriting/r19/assets/ort-wasm-simd-threaded.mjs application/javascript
check_type /handwriting/r19/ort-memory-loader.mjs application/javascript
check_type /handwriting/r19/assets/ort-wasm-simd-threaded.wasm application/wasm
status=$(curl --silent --show-error --head --output /dev/null --write-out '%{http_code}' "$origin/handwriting/missing.mjs")
[[ "$status" == 404 ]] || { echo "Missing module returned $status instead of 404" >&2; exit 1; }
echo 'PASS: missing module is not replaced by the SPA document'
