// Lightweight reusable Socket.IO client singleton
// - Uses server domain from settings when available
// - Exposes join/leave helpers and event on/off wrappers

import {io} from 'socket.io-client';
import {recordDiagnosticEvent, recordDiagnosticSnapshot} from '@/utils/localDiagnostics';

let socket = null;
let connectedDomain = null;
const listeners = new Set();
const connectionListeners = new Set();
let connectionIssueActive = false;

function connectionSnapshot() {
  return {
    connected: Boolean(socket?.connected),
    reconnecting: Boolean(socket && !socket.connected),
  };
}

function notifyConnectionListeners() {
  const state = connectionSnapshot();
  connectionListeners.forEach((handler) => handler(state));
}

export function getServerUrl() {
  const envUrl = import.meta.env.VITE_SERVER_URL;
  // 本地联调必须服从显式开发地址，避免浏览器历史 localStorage 把请求
  // 继续发送到官方服务器。生产构建仍允许学校设置覆盖默认值。
  if (import.meta.env.DEV && envUrl) {
    return envUrl;
  }

  // Production uses the explicitly built backend URL for split deployments,
  // otherwise the reverse proxy on the current origin.
  return import.meta.env.VITE_DEFAULT_KV_SERVER || window.location.origin;
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

    socket = io(serverUrl, {transports:  ["polling","websocket"]});
    socket.on("connect", () => {
      notifyConnectionListeners();
      recordDiagnosticSnapshot("realtime", {connected: true, transport: socket.io.engine?.transport?.name || "unknown"});
      if (connectionIssueActive) {
        recordDiagnosticEvent({category: "REALTIME", severity: "INFO", code: "SOCKET_RECOVERED", message: "实时连接已经恢复"});
        connectionIssueActive = false;
      }
    });
    socket.on("disconnect", (reason) => {
      notifyConnectionListeners();
      recordDiagnosticSnapshot("realtime", {connected: false, reason});
      if (reason === "io client disconnect") return;
      connectionIssueActive = true;
      recordDiagnosticEvent({
        category: "REALTIME",
        severity: "WARNING",
        code: "SOCKET_DISCONNECTED",
        message: "实时连接已中断，客户端将自动重连",
        context: {reason},
      });
    });
    socket.on("connect_error", (error) => {
      notifyConnectionListeners();
      connectionIssueActive = true;
      recordDiagnosticSnapshot("realtime", {connected: false, error: error?.message || "连接失败"});
      recordDiagnosticEvent({
        category: "REALTIME",
        severity: "ERROR",
        code: "SOCKET_CONNECT_ERROR",
        message: error?.message || "实时连接失败",
        context: {serverOrigin: (() => { try { return new URL(serverUrl).origin; } catch { return ""; } })()},
      });
    });

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

export function onConnectionState(handler) {
  getSocket();
  connectionListeners.add(handler);
  handler(connectionSnapshot());
  return () => connectionListeners.delete(handler);
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
  connectionIssueActive = false;
  listeners.clear();
  notifyConnectionListeners();
}
