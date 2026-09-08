import packageInfo from "../../../package.json";
import {classworksV2Api, describeApiError, getClassroomScreenToken} from "@/utils/classworksV2Client";
import {onConnectionState} from "@/utils/socketClient";
import {
  ScreenPublicationQueueError,
  enqueueScreenPublication,
  loadScreenPublicationQueue,
  mutateScreenPublicationQueue,
  screenPublicationQueueKey,
  removeScreenPublicationQueueItem,
  updateScreenPublicationQueueItem,
} from "@/utils/screenPublicationQueue";
import {recordDiagnosticEvent, recordDiagnosticSnapshot} from "@/utils/localDiagnostics";
import {isTransientScreenRequestError} from "./screenRequestError";
import {createScreenUploadRetry} from "@/utils/screenUploadRetry";
import {isScreenReloadBlocked} from "@/utils/screenReloadProtection";

const screenSyncContexts = new WeakMap();

function isCurrentSync(store, bindingId, context) {
  return store.screenSession?.binding?.id === bindingId && screenSyncContexts.get(store) === context;
}

function screenCommandGuard(store) {
  const bindingId = store.screenSession?.binding?.id;
  const context = screenSyncContexts.get(store);
  const token = getClassroomScreenToken();
  return () => Boolean(bindingId && context && token)
    && isCurrentSync(store, bindingId, context) && getClassroomScreenToken() === token;
}

// Mixed into the existing store: actions share its reactive state and Pinia binding.
export const screenSyncActions = {
  readScreenPublicationQueue() {
    const bindingId = this.screenSession?.binding?.id || null;
    if (this.screenQueueBindingId !== bindingId) {
      this.screenPendingUploads = [];
      this.screenQueueReadError = "";
      this.screenQueueBindingId = bindingId;
    }
    try {
      const items = bindingId ? loadScreenPublicationQueue(bindingId, undefined, {strict: true}) : [];
      if (this.screenQueueReadError) screenSyncContexts.get(this)?.retry?.succeeded();
      this.screenPendingUploads = items;
      this.screenQueueReadError = "";
      return true;
    } catch (error) {
      this.reportScreenQueueError(error);
      return false;
    }
  },

  recoverScreenPublicationQueue() {
    const recovered = this.readScreenPublicationQueue();
    const retry = screenSyncContexts.get(this)?.retry;
    if (recovered) retry?.succeeded();
    else retry?.failed();
    retry?.request();
    return recovered;
  },

  initializeScreenSync() {
    this.stopScreenSync();
    const screenSyncCleanup = [];
    const context = {cleanup: screenSyncCleanup, reloadTimers: new Set(), heartbeatRunning: false};
    screenSyncContexts.set(this, context);
    screenSyncCleanup.push(() => {
      for (const timer of context.reloadTimers) window.clearTimeout(timer);
      context.reloadTimers.clear();
    });
    const bindingId = this.screenSession?.binding?.id;
    this.readScreenPublicationQueue();
    const queueChanged = event => {
      if (event.key !== screenPublicationQueueKey(bindingId) || !isCurrentSync(this, bindingId, context)) return;
      this.readScreenPublicationQueue();
      context.retry?.request();
    };
    window.addEventListener("storage", queueChanged);
    screenSyncCleanup.push(() => window.removeEventListener("storage", queueChanged));
    context.retry = createScreenUploadRetry({
      run: () => this.flushScreenPublicationQueue(),
      isOnline: () => isCurrentSync(this, bindingId, context) && this.screenNetworkOnline,
      hasPending: () => Boolean(this.screenQueueReadError) || this.screenPendingUploads.some((item) => item.status === "pending"),
      onError: (error) => this.reportScreenQueueError(error),
    });
    let previousOnline = this.screenNetworkOnline;
    const updateOnline = () => {
      this.screenNetworkOnline = navigator.onLine;
      const recovered = !previousOnline && this.screenNetworkOnline;
      recordDiagnosticSnapshot("screenSync", {
        state: this.screenSyncState,
        online: this.screenNetworkOnline,
        realtimeConnected: this.screenRealtimeConnected,
        pendingUploads: this.screenPendingUploads.length,
        lastSyncedAt: this.screenLastSyncedAt,
        lastHeartbeatAt: this.screenHeartbeatAt,
      });
      if (previousOnline !== this.screenNetworkOnline) {
        recordDiagnosticEvent({
          category: "SCREEN_SYNC",
          severity: this.screenNetworkOnline ? "INFO" : "WARNING",
          code: this.screenNetworkOnline ? "NETWORK_RECOVERED" : "NETWORK_OFFLINE",
          message: this.screenNetworkOnline ? "大屏网络连接已经恢复" : "大屏已进入离线状态",
        });
        previousOnline = this.screenNetworkOnline;
      }
      if (this.screenNetworkOnline) context.retry.request({recovered});
      else context.retry.pause();
    };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    screenSyncCleanup.push(() => window.removeEventListener("online", updateOnline));
    screenSyncCleanup.push(() => window.removeEventListener("offline", updateOnline));
    screenSyncCleanup.push(onConnectionState(({connected}) => {
      const changed = this.screenRealtimeConnected !== connected;
      this.screenRealtimeConnected = connected;
      recordDiagnosticSnapshot("screenSync", {
        state: this.screenSyncState,
        online: this.screenNetworkOnline,
        realtimeConnected: connected,
        pendingUploads: this.screenPendingUploads.length,
        lastSyncedAt: this.screenLastSyncedAt,
        lastHeartbeatAt: this.screenHeartbeatAt,
      });
      if (changed && !connected) {
        recordDiagnosticEvent({
          category: "SCREEN_SYNC",
          severity: "WARNING",
          code: "SCREEN_REALTIME_DISCONNECTED",
          message: "大屏实时同步连接已中断，客户端将自动重连",
        });
      }
      if (connected) context.retry.request();
    }));
    const sendHeartbeat = () => void this.sendScreenHeartbeat();
    const heartbeatTimer = window.setInterval(sendHeartbeat, 60_000);
    window.addEventListener("visibilitychange", sendHeartbeat);
    screenSyncCleanup.push(() => window.clearInterval(heartbeatTimer));
    screenSyncCleanup.push(() => window.removeEventListener("visibilitychange", sendHeartbeat));
    updateOnline();
    sendHeartbeat();
  },

  async sendScreenHeartbeat() {
    const context = screenSyncContexts.get(this);
    const isCurrent = screenCommandGuard(this);
    if (!isCurrent() || !this.screenNetworkOnline || context.heartbeatRunning) return;
    context.heartbeatRunning = true;
    try {
      const result = await classworksV2Api.classroomScreenHeartbeat({
        appVersion: packageInfo.version,
        route: `${window.location.pathname}${window.location.hash}`,
        visibility: document.visibilityState,
        online: navigator.onLine,
        realtimeConnected: this.screenRealtimeConnected,
        pendingUploads: this.screenPendingUploads.length,
        syncState: this.screenSyncState,
        lastError: this.screenQueueReadError || this.screenError,
        displayMode: "screen",
      });
      if (!isCurrent()) return;
      this.screenHeartbeatAt = result.receivedAt;
      recordDiagnosticSnapshot("screenSync", {
        state: this.screenSyncState,
        online: this.screenNetworkOnline,
        realtimeConnected: this.screenRealtimeConnected,
        pendingUploads: this.screenPendingUploads.length,
        lastSyncedAt: this.screenLastSyncedAt,
        lastHeartbeatAt: this.screenHeartbeatAt,
      });
      for (const command of result.commands || []) {
        if (!isCurrent()) return;
        await this.executeScreenCommand(command, isCurrent);
      }
    } catch (error) {
      if (!isCurrent()) return;
      recordDiagnosticEvent({
        category: "SCREEN_HEARTBEAT",
        severity: "WARNING",
        code: error.response?.data?.code || "SCREEN_HEARTBEAT_FAILED",
        message: describeApiError(error, "大屏心跳上报失败"),
        context: {lastHeartbeatAt: this.screenHeartbeatAt, syncState: this.screenSyncState},
      });
    } finally {
      context.heartbeatRunning = false;
    }
  },

  async executeScreenCommand(command, isCurrent = screenCommandGuard(this)) {
    if (!isCurrent()) return;
    const context = screenSyncContexts.get(this);
    try {
      if (command.type === "REFRESH_DATA") {
        // Configuration may change the workspace scope used by the feed request.
        await this.bootstrapClassroomScreen({isCurrent});
        if (!isCurrent()) return;
        await this.loadScreenFeed({isCurrent});
        if (!isCurrent()) return;
        await classworksV2Api.acknowledgeClassroomScreenCommand(command.id, {
          success: true,
          result: {message: "数据已刷新"},
        });
        return;
      }
      if (command.type === "RELOAD_APP") {
        // Leave busy commands unacknowledged so the server can redeliver them.
        if (isScreenReloadBlocked(this)) return;
        await classworksV2Api.acknowledgeClassroomScreenCommand(command.id, {
          success: true,
          result: {message: "重载已接收，页面空闲后执行"},
        });
        if (!isCurrent()) return;
        const schedule = delay => {
          const timer = window.setTimeout(() => {
            context.reloadTimers.delete(timer);
            if (!isCurrent()) return;
            // Editing or submitting may start while the acknowledgement is in flight.
            if (isScreenReloadBlocked(this)) schedule(1000);
            else window.location.reload();
          }, delay);
          context.reloadTimers.add(timer);
        };
        schedule(300);
        return;
      }
      await classworksV2Api.acknowledgeClassroomScreenCommand(command.id, {
        success: false,
        result: {message: "当前版本不支持此指令"},
      });
    } catch (error) {
      if (!isCurrent()) return;
      try {
        await classworksV2Api.acknowledgeClassroomScreenCommand(command.id, {
          success: false,
          result: {message: error.message || "执行失败"},
        });
      } catch {
        // 指令会在下一次心跳再次送达。
      }
    }
  },

  stopScreenSync() {
    const context = screenSyncContexts.get(this);
    context?.retry?.dispose();
    context?.cleanup.forEach((cleanup) => cleanup());
    screenSyncContexts.delete(this);
    this.screenSyncing = false;
  },

  async enqueueOfflineScreenPublication(input, context = {}) {
    const bindingId = this.screenSession?.binding?.id;
    if (!bindingId) throw new Error("大屏尚未绑定，无法保存离线作业");
    try {
      const token = getClassroomScreenToken();
      const items = await mutateScreenPublicationQueue(bindingId, () => {
        if (this.screenSession?.binding?.id !== bindingId || getClassroomScreenToken() !== token) throw new Error("大屏绑定已变化，请重新打开录入窗口。");
        return enqueueScreenPublication(bindingId, input, context);
      });
      if (this.screenSession?.binding?.id !== bindingId || getClassroomScreenToken() !== token) throw new Error("大屏绑定已变化，原绑定的作业已保存在本机队列。");
      this.screenPendingUploads = items;
      this.screenQueueBindingId = bindingId;
      this.screenQueueReadError = "";
    } catch (error) {
      this.reportScreenQueueError(error);
      throw error;
    }
    recordDiagnosticEvent({
      category: "SCREEN_SYNC",
      severity: "WARNING",
      code: "PUBLICATION_QUEUED_OFFLINE",
      message: "作业已保存到本机队列，等待联网同步",
      context: {pendingUploads: this.screenPendingUploads.length},
    });
    screenSyncContexts.get(this)?.retry.request();
    return {
      offlineQueued: true,
      id: this.screenPendingUploads.at(-1)?.id,
      type: "ASSIGNMENT",
      priority: input.priority || "NORMAL",
      status: "PUBLISHED",
      revision: null,
    };
  },

  async flushScreenPublicationQueue() {
    const bindingId = this.screenSession?.binding?.id;
    const context = screenSyncContexts.get(this);
    if (!bindingId || !this.screenNetworkOnline || this.screenSyncing) return;
    context?.retry.begin();
    this.screenSyncing = true;
    let savedAny = false;
    try {
      if (!this.readScreenPublicationQueue()) {
        context?.retry.failed();
        return;
      }
      const pending = this.screenPendingUploads.filter((item) => item.status === "pending");
      for (const item of pending) {
        if (!isCurrentSync(this, bindingId, context) || !this.screenNetworkOnline) break;
        try {
          await classworksV2Api.createScreenPublication(item.input);
          if (!isCurrentSync(this, bindingId, context)) return;
          const remaining = await mutateScreenPublicationQueue(bindingId, () => removeScreenPublicationQueueItem(bindingId, item.id));
          if (!isCurrentSync(this, bindingId, context)) return;
          this.screenPendingUploads = remaining;
          context?.retry.succeeded();
          savedAny = true;
        } catch (error) {
          if (!isCurrentSync(this, bindingId, context)) return;
          if (error instanceof ScreenPublicationQueueError) throw error;
          if (isTransientScreenRequestError(error)) { context?.retry.failed(); break; }
          const remaining = await mutateScreenPublicationQueue(bindingId, () => updateScreenPublicationQueueItem(bindingId, item.id, {
            attempts: item.attempts + 1,
            status: "needs_review",
            error: {
              code: error.response?.data?.code || "SCREEN_UPLOAD_FAILED",
              message: error.response?.data?.message || error.message || "提交失败",
              details: error.response?.data?.details || null,
            },
          }));
          if (!isCurrentSync(this, bindingId, context)) return;
          this.screenPendingUploads = remaining;
          recordDiagnosticEvent({
            category: "SCREEN_SYNC",
            severity: "ERROR",
            code: error.response?.data?.code || "SCREEN_UPLOAD_NEEDS_REVIEW",
            message: describeApiError(error, "离线作业同步失败，需要人工处理"),
            context: {attempts: item.attempts + 1, pendingUploads: this.screenPendingUploads.length},
          });
        }
      }
      if (savedAny && isCurrentSync(this, bindingId, context)) {
        this.screenLastSyncedAt = new Date().toISOString();
        await this.loadActiveFeed();
      }
    } catch (error) {
      if (isCurrentSync(this, bindingId, context)) {
        context?.retry.failed();
        this.reportScreenQueueError(error);
      }
    } finally {
      if (isCurrentSync(this, bindingId, context)) {
        if (!this.screenQueueReadError && !this.readScreenPublicationQueue()) context?.retry.failed();
        this.screenSyncing = false;
        context?.retry.request();
      }
    }
  },

  async retryScreenQueuedPublication(itemId, {allowDuplicate = false} = {}) {
    const bindingId = this.screenSession?.binding?.id;
    const context = screenSyncContexts.get(this);
    if (!bindingId || !this.screenNetworkOnline || this.screenSyncing) return false;
    if (!this.recoverScreenPublicationQueue()) return false;
    const item = this.screenPendingUploads.find((candidate) => candidate.id === itemId);
    if (!item) return false;
    context?.retry.begin();
    this.screenSyncing = true;
    try {
      await classworksV2Api.createScreenPublication({
        ...item.input,
        ...(allowDuplicate ? {allowDuplicate: true} : {}),
      });
      if (!isCurrentSync(this, bindingId, context)) return false;
      const remaining = await mutateScreenPublicationQueue(bindingId, () => removeScreenPublicationQueueItem(bindingId, item.id));
      if (!isCurrentSync(this, bindingId, context)) return false;
      this.screenPendingUploads = remaining;
      context?.retry.succeeded();
      this.screenLastSyncedAt = new Date().toISOString();
      await this.loadActiveFeed();
      return true;
    } catch (error) {
      if (!isCurrentSync(this, bindingId, context)) return false;
      if (error instanceof ScreenPublicationQueueError) {
        context?.retry.failed();
        this.reportScreenQueueError(error);
        return false;
      }
      if (isTransientScreenRequestError(error)) context?.retry.failed();
      try {
        const remaining = await mutateScreenPublicationQueue(bindingId, () => updateScreenPublicationQueueItem(bindingId, item.id, {
          attempts: item.attempts + 1,
          status: isTransientScreenRequestError(error) ? "pending" : "needs_review",
          error: {
            code: error.response?.data?.code || "SCREEN_UPLOAD_FAILED",
            message: error.response?.data?.message || error.message || "提交失败",
            details: error.response?.data?.details || null,
          },
        }));
        if (!isCurrentSync(this, bindingId, context)) return false;
        this.screenPendingUploads = remaining;
      } catch (storageError) {
        if (!isTransientScreenRequestError(error)) context?.retry.failed();
        this.reportScreenQueueError(storageError);
        return false;
      }
      recordDiagnosticEvent({
        category: "SCREEN_SYNC",
        severity: isTransientScreenRequestError(error) ? "WARNING" : "ERROR",
        code: error.response?.data?.code || "SCREEN_UPLOAD_RETRY_FAILED",
        message: describeApiError(error, "重试同步失败"),
        context: {attempts: item.attempts + 1, pendingUploads: this.screenPendingUploads.length},
      });
      return false;
    } finally {
      if (isCurrentSync(this, bindingId, context)) {
        this.screenSyncing = false;
        context?.retry.request();
      }
    }
  },

  async removeScreenQueuedPublication(itemId) {
    const bindingId = this.screenSession?.binding?.id;
    if (!bindingId || this.screenSyncing || !this.recoverScreenPublicationQueue()) return;
    try {
      const remaining = await mutateScreenPublicationQueue(bindingId, () => removeScreenPublicationQueueItem(bindingId, itemId));
      if (this.screenSession?.binding?.id !== bindingId) return;
      this.screenPendingUploads = remaining;
      screenSyncContexts.get(this)?.retry.request();
    } catch (error) {
      this.reportScreenQueueError(error);
    }
  },

  reportScreenQueueError(error) {
    if (error.code === "SCREEN_QUEUE_READ_FAILED") {
      const bindingId = this.screenSession?.binding?.id || null;
      if (this.screenQueueBindingId !== bindingId) {
        this.screenPendingUploads = [];
        this.screenQueueReadError = "";
        this.screenQueueBindingId = bindingId;
      }
      const message = "无法读取本机待提交作业，暂时不能确认同步是否完成。已保留上次读取的列表；请勿清除浏览器数据，存储恢复后将重新读取。";
      if (!this.screenQueueReadError) recordDiagnosticEvent({
        category: "SCREEN_SYNC", severity: "ERROR", code: error.code, message,
      });
      this.screenQueueReadError = message;
      screenSyncContexts.get(this)?.retry?.request();
      return;
    }
    this.screenError = describeApiError(error, "本机同步队列操作失败，请重试");
    recordDiagnosticEvent({
      category: "SCREEN_SYNC",
      severity: "ERROR",
      code: error.code || "SCREEN_QUEUE_FAILED",
      message: this.screenError,
    });
  },
};
