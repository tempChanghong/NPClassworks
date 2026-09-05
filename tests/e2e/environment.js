// Keep every test service on loopback, including when Windows reserves the default ports.
function port(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`Invalid ${name}`);
  return value;
}

export const webPort = port("E2E_WEB_PORT", 4180);
export const apiPort = port("E2E_API_PORT", 4181);
if (webPort === apiPort) throw new Error("E2E web and API ports must differ");
export const origin = `http://127.0.0.1:${webPort}`;
export const api = `http://127.0.0.1:${apiPort}`;
