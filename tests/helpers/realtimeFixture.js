// Only the transport is replaced. Store subscriptions, debounce and HTTP reloads run unchanged.
const listeners = new Map();
export const rooms = new Set();
let serverUrl = "";

export function configureRealtime(url) {
  serverUrl = url;
  listeners.clear();
  rooms.clear();
}

export function getServerUrl() { return serverUrl; }
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}
export function emitServerEvent(event, payload) {
  for (const handler of listeners.get(event) || []) handler(payload);
}
export function onConnect(handler) { return on("connect", handler); }
export function onConnectionState(handler) {
  handler({connected: true});
  return on("connection-state", handler);
}
export function joinWorkspaces(ids) { ids.forEach((id) => rooms.add(id)); }
export function leaveWorkspaces(ids) {
  if (!ids) rooms.clear();
  else ids.forEach((id) => rooms.delete(id));
}
