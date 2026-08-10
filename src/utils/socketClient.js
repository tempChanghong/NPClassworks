// Lightweight reusable Socket.IO client singleton
// - Uses server domain from settings when available
// - Exposes join/leave helpers and event on/off wrappers

import {io} from 'socket.io-client';
import {getSetting} from '@/utils/settings';
import {getEffectiveServerUrl, isRotationEnabled} from '@/utils/serverRotation';

let socket = null;
let connectedDomain = null;
const listeners = new Set();

export function getServerUrl() {
  const envUrl = import.meta.env.VITE_SERVER_URL;
  // 本地联调必须服从显式开发地址，避免浏览器历史 localStorage 把请求
  // 继续发送到官方服务器。生产构建仍允许学校设置覆盖默认值。
  if (import.meta.env.DEV && envUrl) {
    return envUrl;
  }

  // For classworkscloud provider, use the effective server URL from rotation
  if (isRotationEnabled()) {
    return getEffectiveServerUrl();
  }

  // Prefer configured server domain; fallback to env; then current origin
  const cfg = getSetting('server.domain');
  return cfg || envUrl || window.location.origin;
}

export function getSocket() {
  const serverUrl = getServerUrl();
  if (!socket || connectedDomain !== serverUrl) {
    if (socket) {
      try {
        socket.disconnect();
      } catch (e) {
        void e; // ignore
      }
      socket = null;
    }
    connectedDomain = serverUrl;

    // For classworkscloud, create socket with the first server in rotation
    // Note: Socket.IO's built-in reconnection will retry the same server URL.
    // Server rotation is handled at the HTTP request level, not Socket.IO level.
    // If the Socket.IO server goes down, the connection will fail until the server recovers.
    socket = io(serverUrl, {transports:  ["polling","websocket"]});

    // Re-attach previously registered event handlers on new socket instance
    listeners.forEach(({event, handler}) => {
      socket.on(event, handler);
    });
  }
  return socket;
}

export function on(event, handler) {
  const s = getSocket();
  s.on(event, handler);
  listeners.add({event, handler});
  return () => off(event, handler);
}

export function off(event, handler) {
  if (!socket) return;
  socket.off(event, handler);
  // Remove only matching entry
  for (const item of Array.from(listeners)) {
    if (item.event === event && item.handler === handler) {
      listeners.delete(item);
    }
  }
}

export function joinToken(token) {
  const s = getSocket();
  if (!token) return;
  s.emit('join-token', {token});
}

export function leaveToken(token) {
  if (!socket) return;
  socket.emit('leave-token', {token});
}

export function leaveAll() {
  if (!socket) return;
  socket.emit('leave-all');
}

export function joinWorkspaces(workspaceIds) {
  const s = getSocket();
  if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) return;
  s.emit('join-workspaces', {workspaceIds});
}

export function leaveWorkspaces(workspaceIds = null) {
  if (!socket) return;
  socket.emit('leave-workspaces', workspaceIds ? {workspaceIds} : {});
}

export function onConnect(handler) {
  const s = getSocket();
  s.on('connect', handler);
  return () => s.off('connect', handler);
}

export function sendEvent(type, content = null) {
  const s = getSocket();
  s.emit('send-event', {
    type,
    content
  });
}

export function disconnect() {
  if (!socket) return;
  try {
    socket.disconnect();
  } catch (e) {
    void e; // ignore
  }
  socket = null;
  connectedDomain = null;
  listeners.clear();
}
