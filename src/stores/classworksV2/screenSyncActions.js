import packageInfo from "../../../package.json";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";
import {onConnectionState} from "@/utils/socketClient";
import {
  ScreenPublicationQueueError,
  enqueueScreenPublication,
  loadScreenPublicationQueue,
  removeScreenPublicationQueueItem,
  updateScreenPublicationQueueItem,
} from "@/utils/screenPublicationQueue";
import {recordDiagnosticEvent, recordDiagnosticSnapshot} from "@/utils/localDiagnostics";
import {isTransientScreenRequestError} from "./screenRequestError";
import {createScreenUploadRetry} from "@/utils/screenUploadRetry";

const screenSyncContexts = new WeakMap();

function isCurrentSync(store, bindingId, context) {
  return store.screenSession?.binding?.id === bindingId && screenSyncContexts.get(store) === context;
}

// Mixed into the existing store: actions share its reactive state and Pinia binding.
export const screenSyncActions = {
  initializeScreenSync() {
    this.stopScreenSync();
    const screenSyncCleanup = [];
    const context = {cleanup: screenSyncCleanup};
    screenSyncContexts.set(this, context);
    const bindingId = this.screenSession?.binding?.id;
    this.screenPendingUploads = bindingId ? loadScreenPublicationQueue(bindingId) : [];
    context.retry = createScreenUploadRetry({
      run: () => this.flushScreenPublicationQueue(),
      isOnline: () => isCurrentSync(this, bindingId, context) && this.screenNetworkOnline,
      hasPending: () => this.screenPendingUploads.some((item) => item.status === "pending"),
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
    if (!this.screenSession || !this.screenNetworkOnline) return;
    try {
      const result = await classworksV2Api.classroomScreenHeartbeat({
        appVersion: packageInfo.version,
        route: `${window.location.pathname}${window.location.hash}`,
        visibility: document.visibilityState,
        online: navigator.onLine,
        realtimeConnected: this.screenRealtimeConnected,
        pendingUploads: this.screenPendingUploads.length,
        syncState: this.screenSyncState,
        lastError: this.screenError,
        displayMode: "screen",
      });
      this.screenHeartbeatAt = result.receivedAt;
      recordDiagnosticSnapshot("screenSync", {
        state: this.screenSyncState,
        online: this.screenNetworkOnline,
        realtimeConnected: this.screenRealtimeConnected,
        pendingUploads: this.screenPendingUploads.length,
        lastSyncedAt: this.screenLastSyncedAt,
        lastHeartbeatAt: this.screenHeartbeatAt,
      });
      for (const command of result.commands || []) await this.executeScreenCommand(command);
    } catch (error) {
      recordDiagnosticEvent({
        category: "SCREEN_HEARTBEAT",
        severity: "WARNING",
        code: error.response?.data?.code || "SCREEN_HEARTBEAT_FAILED",
        message: describeApiError(error, "大屏心跳上报失败"),
        context: {lastHeartbeatAt: this.screenHeartbeatAt, syncState: this.screenSyncState},
      });
    }
  },

  async executeScreenCommand(command) {
    try {
      if (command.type === "REFRESH_DATA") {
        await Promise.all([this.bootstrapClassroomScreen(), this.loadScreenFeed()]);
        await classworksV2Api.acknowledgeClassroomScreenCommand(command.id, {
          success: true,
          result: {message: "数据已刷新"},
        });
        return;
      }
      if (command.type === "RELOAD_APP") {
        await classworksV2Api.acknowledgeClassroomScreenCommand(command.id, {
          success: true,
          result: {message: "页面即将重新载入"},
        });
        window.setTimeout(() => window.location.reload(), 300);
        return;
      }
      await classworksV2Api.acknowledgeClassroomScreenCommand(command.id, {
        success: false,
        result: {message: "当前版本不支持此指令"},
      });
    } catch (error) {
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

  enqueueOfflineScreenPublication(input, context = {}) {
    const bindingId = this.screenSession?.binding?.id;
    if (!bindingId) throw new Error("大屏尚未绑定，无法保存离线作业");
    try {
      this.screenPendingUploads = enqueueScreenPublication(bindingId, input, context);
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
    const pending = loadScreenPublicationQueue(bindingId).filter((item) => item.status === "pending");
    if (!pending.length) {
      this.screenPendingUploads = loadScreenPublicationQueue(bindingId);
      return;
    }
    this.screenSyncing = true;
    let savedAny = false;
    try {
      for (const item of pending) {
        if (!isCurrentSync(this, bindingId, context) || !this.screenNetworkOnline) break;
        try {
          await classworksV2Api.createScreenPublication(item.input);
          if (!isCurrentSync(this, bindingId, context)) return;
          this.screenPendingUploads = removeScreenPublicationQueueItem(bindingId, item.id);
          context?.retry.succeeded();
          savedAny = true;
        } catch (error) {
          if (!isCurrentSync(this, bindingId, context)) return;
          if (error instanceof ScreenPublicationQueueError) throw error;
          if (isTransientScreenRequestError(error)) { context?.retry.failed(); break; }
          this.screenPendingUploads = updateScreenPublicationQueueItem(bindingId, item.id, {
            attempts: item.attempts + 1,
            status: "needs_review",
            error: {
              code: error.response?.data?.code || "SCREEN_UPLOAD_FAILED",
              message: error.response?.data?.message || error.message || "提交失败",
              details: error.response?.data?.details || null,
            },
          });
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
        this.screenPendingUploads = loadScreenPublicationQueue(bindingId);
        this.screenSyncing = false;
        context?.retry.request();
      }
    }
  },

  async retryScreenQueuedPublication(itemId, {allowDuplicate = false} = {}) {
    const bindingId = this.screenSession?.binding?.id;
    const context = screenSyncContexts.get(this);
    const item = this.screenPendingUploads.find((candidate) => candidate.id === itemId);
    if (!bindingId || !item || !this.screenNetworkOnline || this.screenSyncing) return false;
    context?.retry.begin();
    this.screenSyncing = true;
    try {
      await classworksV2Api.createScreenPublication({
        ...item.input,
        ...(allowDuplicate ? {allowDuplicate: true} : {}),
      });
      if (!isCurrentSync(this, bindingId, context)) return false;
      this.screenPendingUploads = removeScreenPublicationQueueItem(bindingId, item.id);
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
        this.screenPendingUploads = updateScreenPublicationQueueItem(bindingId, item.id, {
          attempts: item.attempts + 1,
          status: isTransientScreenRequestError(error) ? "pending" : "needs_review",
          error: {
            code: error.response?.data?.code || "SCREEN_UPLOAD_FAILED",
            message: error.response?.data?.message || error.message || "提交失败",
            details: error.response?.data?.details || null,
          },
        });
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

  removeScreenQueuedPublication(itemId) {
    const bindingId = this.screenSession?.binding?.id;
    if (!bindingId) return;
    try {
      this.screenPendingUploads = removeScreenPublicationQueueItem(bindingId, itemId);
      screenSyncContexts.get(this)?.retry.request();
    } catch (error) {
      this.reportScreenQueueError(error);
    }
  },

  reportScreenQueueError(error) {
    this.screenError = describeApiError(error, "本机同步队列操作失败，请重试");
    recordDiagnosticEvent({
      category: "SCREEN_SYNC",
      severity: "ERROR",
      code: error.code || "SCREEN_QUEUE_FAILED",
      message: this.screenError,
    });
  },
};
