<template>
  <section
    class="classroom-screen-view"
    :style="burnInStyle"
  >
    <v-alert
      v-if="deliveryState.storageError || deliveryState.status === 'blocked'"
      class="mb-3"
      type="warning"
      variant="tonal"
    >
      {{ deliveryState.storageError
        ? '通知回执的本机存储异常，待发送记录可能无法在刷新后恢复。请保持页面打开并重试。'
        : '通知回执被服务器拒绝，已保留待处理记录并停止自动重试。请联系管理员检查大屏权限。' }}
      <v-btn
        v-if="deliveryState.storageError"
        variant="text"
        @click="retryNotificationDelivery"
      >
        重试回执存储
      </v-btn>
    </v-alert>
    <v-card
      class="screen-toolbar rounded-xl"
      color="primary"
      variant="tonal"
    >
      <v-card-text class="screen-toolbar-content">
        <div class="screen-class-block">
          <v-avatar
            color="primary"
            size="42"
            variant="flat"
          >
            <v-icon icon="mdi-monitor-dashboard" />
          </v-avatar>
          <div class="screen-identity">
            <div class="font-weight-bold screen-class-name">
              {{ className }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ workspaceSummary }}
            </div>
          </div>
          <ScreenSyncStatus />
        </div>
        <ClassroomTimeCard inline />
        <div class="screen-toolbar-actions">
          <v-badge
            color="error"
            :content="pendingNoticeCount"
            :model-value="pendingNoticeCount > 0"
          >
            <v-btn
              prepend-icon="mdi-bell-outline"
              title="通知"
              variant="tonal"
              @click="notificationCenterOpen = true"
            >
              <span class="screen-toolbar-action-label">通知</span>
            </v-btn>
          </v-badge>
          <v-btn
            prepend-icon="mdi-monitor-eye"
            title="显示设置"
            variant="tonal"
            @click="$emit('settings')"
          >
            <span class="screen-toolbar-action-label">设置</span>
          </v-btn>
          <v-btn
            prepend-icon="mdi-toolbox-outline"
            title="课堂工具"
            variant="tonal"
            @click="$emit('tools')"
          >
            <span class="screen-toolbar-action-label">课堂工具</span>
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-monitor-edit"
            title="录入作业"
            variant="elevated"
            @click="$emit('create')"
          >
            <span class="screen-toolbar-action-label">录入作业</span>
          </v-btn>
          <v-btn
            :loading="store.feedLoading"
            icon="mdi-refresh"
            title="刷新"
            variant="text"
            @click="store.loadActiveFeed()"
          />
          <v-menu>
            <template #activator="{props}">
              <v-btn
                v-bind="props"
                icon="mdi-dots-vertical"
                title="更多"
                variant="text"
              />
            </template>
            <v-list>
              <v-list-item
                prepend-icon="mdi-calendar-week"
                title="一周总览"
                @click="weekTool.open()"
              />
              <v-list-item
                :disabled="!printTool || printTool.disabled"
                prepend-icon="mdi-printer-outline"
                title="打印作业清单"
                @click="printTool.openPreview()"
              />
              <v-list-item
                prepend-icon="mdi-file-cog-outline"
                subtitle="需验证本大屏 PIN"
                title="下载本机诊断包"
                @click="$emit('diagnostics')"
              />
              <v-list-item
                prepend-icon="mdi-exit-to-app"
                subtitle="需验证本大屏 PIN"
                title="临时退出大屏"
                @click="$emit('exit')"
              />
            </v-list>
          </v-menu>
        </div>
      </v-card-text>
    </v-card>

    <ScreenNoiseStatus @open="$emit('noise')" />
    <HomeworkPrintButton
      ref="printTool"
      :class-name="className"
      hide-button
      :scope-label="workspaceSummary"
    />
    <HomeworkWeekButton
      ref="weekTool"
      :class-name="className"
      hide-button
    />

    <v-alert
      v-if="store.screenError"
      class="mt-3"
      closable
      type="warning"
      variant="tonal"
    >
      {{ store.screenError }}
    </v-alert>

    <v-alert
      v-if="store.feedLoadError && store.feed.length"
      class="mt-3"
      color="warning"
      icon="mdi-cloud-alert-outline"
      variant="tonal"
    >
      {{ store.feedLoadError }}
      <template #append>
        <v-btn
          :loading="store.feedLoading"
          prepend-icon="mdi-refresh"
          variant="text"
          @click="store.loadScreenFeed()"
        >
          重试同步
        </v-btn>
      </template>
    </v-alert>

    <ScreenNoticePopup
      :key="bindingId"
      :notices="activeNotices"
      :acknowledged-keys="acknowledgedNoticeKeys"
      :pending-keys="confirmingNoticeKeys"
      :confirmation-errors="noticeConfirmationErrors"
      @acknowledge="acknowledgeNotice"
    />

    <ScreenNotificationCenter
      v-model="notificationCenterOpen"
      :acknowledged-keys="acknowledgedNoticeKeys"
      :pending-keys="confirmingNoticeKeys"
      :confirmation-errors="noticeConfirmationErrors"
      :notices="activeNotices"
      @acknowledge="acknowledgeNotice"
      @acknowledge-all="acknowledgeNotices"
    />

    <BoardDateNavigator
      class="screen-date-navigator mt-3"
      can-copy-to-today
      :date="store.boardDate"
      @change="store.setBoardDate"
      @copy-to-today="$emit('copy-board')"
    />

    <HomeworkSubjectStatus />
    <ScreenHomeworkChanges :font-scale="settings.fontScale" />
    <ScreenHomeworkFocus
      ref="focusTool"
      :font-scale="settings.fontScale"
    />

    <v-progress-linear
      v-if="store.feedLoading && store.feed.length"
      class="mt-3"
      indeterminate
      rounded
    />
    <v-skeleton-loader
      v-if="store.feedLoading && !store.feed.length"
      class="mt-4"
      type="article, article"
    />

    <div
      v-else-if="store.feed.length"
      class="mt-4"
    >
      <div class="d-flex align-center flex-wrap ga-2 mb-3">
        <v-chip
          prepend-icon="mdi-update"
          size="small"
          variant="tonal"
        >
          更新于 {{ generatedAtLabel }}
        </v-chip>
        <v-chip
          prepend-icon="mdi-source-branch"
          size="small"
          variant="tonal"
        >
          {{ store.screenWorkspaces.length }} 个相关教学空间
        </v-chip>
      </div>
      <OrganizedHomeworkFeed
        :can-edit="store.screenCanEdit"
        exclude-urgent-notices
        :publications="store.feed"
        screen-mode
        :settings="settings"
        @edit="$emit('edit', $event)"
        @history="$emit('history', $event)"
        @focus="focusTool.open($event.publication, $event.activator)"
      />
    </div>

    <v-empty-state
      v-else-if="store.feedLoadError"
      class="mt-6 rounded-xl"
      headline="内容加载失败"
      icon="mdi-cloud-alert-outline"
      :text="store.feedLoadError"
    >
      <template #actions>
        <v-btn
          color="primary"
          :loading="store.feedLoading"
          prepend-icon="mdi-refresh"
          variant="tonal"
          @click="store.loadScreenFeed()"
        >
          重新加载
        </v-btn>
      </template>
    </v-empty-state>

    <v-empty-state
      v-else
      class="mt-6"
      :headline="`${boardDateLabel}尚未录入作业`"
      icon="mdi-check-circle-outline"
      text="本行政班及相关走班的作业会按日期出现在这里"
    />

    <div
      class="screen-action-dock"
      :class="`screen-action-dock--${settings.actionPosition}`"
    >
      <div class="screen-action-dock__surface">
        <v-btn
          class="screen-action-dock__compact"
          icon="mdi-chevron-left"
          title="前一天"
          variant="text"
          @click="changeBoardDate(-1)"
        />
        <v-btn
          class="screen-action-dock__today"
          prepend-icon="mdi-calendar-today-outline"
          variant="text"
          @click="goToToday"
        >
          今天
        </v-btn>
        <v-btn
          class="screen-action-dock__compact"
          icon="mdi-chevron-right"
          title="后一天"
          variant="text"
          @click="changeBoardDate(1)"
        />
        <span class="screen-action-dock__divider" />
        <v-badge
          color="error"
          :content="pendingNoticeCount"
          :model-value="pendingNoticeCount > 0"
        >
          <v-btn
            class="screen-action-dock__compact"
            icon="mdi-bell-outline"
            title="通知中心"
            variant="text"
            @click="notificationCenterOpen = true"
          />
        </v-badge>
        <v-btn
          class="screen-action-dock__compact"
          icon="mdi-toolbox-outline"
          title="课堂工具"
          variant="text"
          @click="$emit('tools')"
        />
        <v-btn
          class="screen-action-dock__compact"
          icon="mdi-monitor-eye"
          title="显示设置"
          variant="text"
          @click="$emit('settings')"
        />
        <v-btn
          class="screen-action-dock__compact"
          :loading="store.feedLoading"
          icon="mdi-refresh"
          title="刷新"
          variant="text"
          @click="store.loadActiveFeed()"
        />
        <v-btn
          class="screen-action-dock__button"
          color="primary"
          prepend-icon="mdi-plus-circle-outline"
          variant="flat"
          @click="$emit('create')"
        >
          录入作业
        </v-btn>
      </div>
    </div>
  </section>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import ClassroomTimeCard from "@/components/v2/ClassroomTimeCard.vue";
import HomeworkSubjectStatus from "@/components/v2/HomeworkSubjectStatus.vue";
import ScreenHomeworkChanges from "@/components/v2/ScreenHomeworkChanges.vue";
import ScreenHomeworkFocus from "@/components/v2/ScreenHomeworkFocus.vue";
import HomeworkWeekButton from "@/components/v2/HomeworkWeekButton.vue";
import OrganizedHomeworkFeed from "@/components/v2/OrganizedHomeworkFeed.vue";
import ScreenNoticePopup from "@/components/v2/ScreenNoticePopup.vue";
import ScreenNoiseStatus from "@/components/v2/ScreenNoiseStatus.vue";
import BoardDateNavigator from "@/components/v2/BoardDateNavigator.vue";
import ScreenSyncStatus from "@/components/v2/ScreenSyncStatus.vue";
import HomeworkPrintButton from "@/components/v2/HomeworkPrintButton.vue";
import ScreenNotificationCenter from "@/components/v2/ScreenNotificationCenter.vue";
import {boardDateRelativeLabel, shiftBoardDate, todayBoardDate} from "@/utils/boardDate";
import {useCurrentBoardDate} from "@/composables/useCurrentBoardDate";
import {classworksV2Api, getClassroomScreenToken} from "@/utils/classworksV2Client";
import {createNotificationDeliveryQueue, notificationDeliveryStorageKey} from "@/utils/notificationDeliveryQueue";
import {getServerUrl} from "@/utils/socketClient";
import {recordDiagnosticEvent, recordDiagnosticSnapshot} from "@/utils/localDiagnostics";
import {
  alertableScreenNotifications,
  createNotificationAlertController,
  notificationAlertKey,
  notificationAcknowledgedStorageKey,
  readAcknowledgedNotificationKeys,
  rememberAcknowledgedNotification,
  screenNotificationSoundProfile,
} from "@/utils/notificationAlerts";
import {getSetting} from "@/utils/settings";
import {
  loadScreenDisplaySettings,
  saveScreenDisplaySettings,
  sanitizeScreenDisplaySettings,
} from "@/utils/screenDisplaySettings";

defineEmits(["create", "edit", "history", "tools", "noise", "copy-board", "settings", "exit", "diagnostics"]);
const store = useClassworksV2Store();
const focusTool = ref(null);
const printTool = ref(null);
const weekTool = ref(null);
const settings = ref(loadScreenDisplaySettings(store.screenSession?.binding?.id));
const notificationCenterOpen = ref(false);
const acknowledgedNoticeKeys = ref(readAcknowledgedNotificationKeys(store.screenSession?.binding?.id));
const confirmingNoticeKeys = ref(new Set());
const noticeConfirmationErrors = ref(new Map());
const burnInStep = ref(0);
let burnInTimer = null;
let notificationAlertController = createNotificationAlertController({scopeId: store.screenSession?.binding?.id});
const deliveryState = ref({});
function createDeliveryQueue() {
  let reportedBlock = false;
  const binding = store.screenSession?.binding;
  const token = getClassroomScreenToken();
  return createNotificationDeliveryQueue({
    storageKey: notificationDeliveryStorageKey(getServerUrl(), binding),
    storage: {
      getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key), key: index => localStorage.key(index),
      get length() { return localStorage.length; },
    },
    send: (items) => {
      if (!binding?.id || binding.id !== store.screenSession?.binding?.id || token !== getClassroomScreenToken()) {
        throw {status: 401};
      }
      return classworksV2Api.acknowledgeScreenNotifications(items);
    },
    onStateChange: (state) => {
      deliveryState.value = state;
      recordDiagnosticSnapshot("notificationDelivery", state);
      if (state.status === "blocked" && !reportedBlock) {
        reportedBlock = true;
        recordDiagnosticEvent({
          category: "SCREEN",
          code: "NOTIFICATION_DELIVERY_BLOCKED",
          message: "通知回执被服务器拒绝，已停止自动重试并保留待处理状态",
          context: state,
        });
      }
    },
  });
}
let notificationDeliveryQueue = createDeliveryQueue();

function retryNotificationDelivery() {
  void notificationDeliveryQueue.retryNow();
}

function pauseNotificationDelivery() {
  notificationDeliveryQueue.pause();
}

const bindingId = computed(() => store.screenSession?.binding?.id || "");
const activeNotices = computed(() => store.feed.filter((publication) => publication.type === "NOTICE"));
const pendingNoticeCount = computed(() => activeNotices.value.filter((notice) =>
  !acknowledgedNoticeKeys.value.has(notificationAlertKey(notice))).length);
watch(notificationCenterOpen, (open) => {
  if (open) {
    acknowledgedNoticeKeys.value = readAcknowledgedNotificationKeys(bindingId.value, localStorage, activeNotices.value);
  }
});

function syncAcknowledgedNotices(event) {
  if (event.storageArea !== localStorage || event.key !== notificationAcknowledgedStorageKey(bindingId.value)) return;
  // Re-read current storage instead of applying a possibly superseded event.
  // Missing/corrupt data must not undo confirmations already known by this page.
  try {
    const saved = JSON.parse(localStorage.getItem(event.key));
    if (!Array.isArray(saved) || !saved.every(key => typeof key === "string")) return;
    const keys = readAcknowledgedNotificationKeys(bindingId.value, localStorage, activeNotices.value);
    acknowledgedNoticeKeys.value = new Set([...acknowledgedNoticeKeys.value, ...keys]);
    keys.forEach(key => noticeConfirmationErrors.value.delete(key));
  } catch { /* Keep the current UI when local storage cannot be read. */ }
}
const className = computed(() => store.screenSession?.binding?.administrativeClass?.name || "班级大屏");
const currentBoardDay = useCurrentBoardDate();
const boardDateLabel = computed(() => boardDateRelativeLabel(store.boardDate, currentBoardDay.value));
const workspaceSummary = computed(() => {
  const groups = store.screenWorkspaces.filter((workspace) => workspace.type === "COURSE_GROUP");
  return groups.length ? `行政班及 ${groups.length} 个相关走班` : "全科随行政班";
});
const generatedAtLabel = computed(() => store.feedGeneratedAt
  ? new Intl.DateTimeFormat("zh-CN", {hour: "2-digit", minute: "2-digit"}).format(new Date(store.feedGeneratedAt))
  : "尚未同步");
const burnInStyle = computed(() => {
  if (!settings.value.antiBurnInShift) return {};
  const offsets = [[0, 0], [1, -1], [-1, 1], [2, 0], [0, 2], [-2, 0], [0, -2]];
  const [x, y] = offsets[burnInStep.value % offsets.length];
  return {transform: `translate(${x}px, ${y}px)`};
});

function updatePerformanceClass() {
  document.body.classList.toggle(
    "classworks-screen-efficient",
    settings.value.performanceMode === "efficient",
  );
}

watch([bindingId, () => store.screenSession?.binding?.credentialVersion], ([id]) => {
  notificationDeliveryQueue.dispose();
  notificationDeliveryQueue = createDeliveryQueue();
  settings.value = loadScreenDisplaySettings(id);
  acknowledgedNoticeKeys.value = readAcknowledgedNotificationKeys(id);
  confirmingNoticeKeys.value = new Set();
  noticeConfirmationErrors.value = new Map();
  notificationCenterOpen.value = false;
  notificationAlertController = createNotificationAlertController({scopeId: id});
  retryNotificationDelivery();
}, {immediate: true});

watch(() => settings.value.performanceMode, updatePerformanceClass);

watch(() => `${bindingId.value}:` + store.feed.filter((publication) => publication.type === "NOTICE")
  .map((publication) => `${publication.id}:${publication.revision}`).join(","), () => {
  const acknowledged = readAcknowledgedNotificationKeys(bindingId.value, localStorage, activeNotices.value);
  acknowledgedNoticeKeys.value = acknowledged;
  const items = store.feed.filter((publication) => publication.type === "NOTICE").map((publication) => ({
    publicationId: publication.id,
    revision: publication.revision,
    displayed: true,
    acknowledged: acknowledged.has(notificationAlertKey(publication)),
  }));
  if (!items.length || !store.screenSession) return;
  notificationDeliveryQueue.enqueue(items);
}, {immediate: true});

watch(() => `${bindingId.value}:${activeNotices.value
  .map((publication) => `${publication.id}:${publication.revision}`)
  .join(",")}`, () => {
  void notificationAlertController.alert(alertableScreenNotifications(activeNotices.value), {
    soundEnabled: settings.value.urgentNoticeSound,
    soundProfile: (notice) => screenNotificationSoundProfile(notice, {
      singleSound: getSetting("notification.singleSound"),
      urgentSound: getSetting("notification.urgentSound"),
    }),
    systemNotificationEnabled: settings.value.backgroundSystemNotification,
  });
}, {immediate: true});

function acknowledgeNotice(publication) {
  if (!publication?.id || !store.screenSession) return;
  acknowledgeNotices([publication]);
}

async function acknowledgeNotices(publications) {
  const valid = [...new Map((publications || []).filter(publication => publication?.id
    && !confirmingNoticeKeys.value.has(notificationAlertKey(publication)))
    .map(publication => [notificationAlertKey(publication), publication])).values()];
  if (!valid.length || !store.screenSession) return;
  const queue = notificationDeliveryQueue;
  const keys = valid.map(notificationAlertKey);
  const isCurrent = () => queue === notificationDeliveryQueue && queue.getState().status !== "disposed";
  keys.forEach(key => { confirmingNoticeKeys.value.add(key); noticeConfirmationErrors.value.delete(key); });
  try {
    // Keep local confirmation durable even if navigation interrupts the lock wait.
    for (const publication of valid) rememberAcknowledgedNotification(publication, bindingId.value);
    const saved = await queue.enqueue(valid.map((publication) => ({
      publicationId: publication.id,
      revision: publication.revision,
      displayed: true,
      acknowledged: true,
    })));
    if (!isCurrent()) return;
    if (!saved) throw new Error("Receipt persistence failed");
    acknowledgedNoticeKeys.value = readAcknowledgedNotificationKeys(bindingId.value, localStorage, activeNotices.value);
  } catch {
    if (isCurrent()) keys.forEach(key => noticeConfirmationErrors.value.set(key, "确认记录暂未完成本机保存，请重试。"));
  } finally {
    if (isCurrent()) keys.forEach(key => confirmingNoticeKeys.value.delete(key));
  }
}

function applySettings(value) {
  settings.value = saveScreenDisplaySettings(bindingId.value, value);
}

function changeBoardDate(days) {
  void store.setBoardDate(shiftBoardDate(store.boardDate, days));
}

function goToToday() {
  void store.setBoardDate(todayBoardDate());
}

function handleShortcut(event) {
  if (!event.ctrlKey || event.altKey || event.metaKey) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  let fontScale = settings.value.fontScale;
  if (["+", "=", "Add"].includes(event.key)) fontScale += 10;
  else if (["-", "Subtract"].includes(event.key)) fontScale -= 10;
  else if (event.key === "0") fontScale = 130;
  else return;
  event.preventDefault();
  applySettings(sanitizeScreenDisplaySettings({...settings.value, fontScale}));
}

onMounted(() => {
  document.body.classList.add("classworks-screen-active");
  updatePerformanceClass();
  window.addEventListener("keydown", handleShortcut);
  window.addEventListener("online", retryNotificationDelivery);
  window.addEventListener("offline", pauseNotificationDelivery);
  window.addEventListener("storage", syncAcknowledgedNotices);
  retryNotificationDelivery();
  burnInTimer = window.setInterval(() => {
    burnInStep.value += 1;
  }, 5 * 60 * 1000);
});

onUnmounted(() => {
  document.body.classList.remove("classworks-screen-active");
  document.body.classList.remove("classworks-screen-efficient");
  window.removeEventListener("keydown", handleShortcut);
  window.removeEventListener("online", retryNotificationDelivery);
  window.removeEventListener("offline", pauseNotificationDelivery);
  window.removeEventListener("storage", syncAcknowledgedNotices);
  notificationDeliveryQueue.dispose();
  window.clearInterval(burnInTimer);
});
</script>

<style scoped>
.classroom-screen-view {
  padding-bottom: 104px;
  width: calc(100% - 4px);
  margin: 2px;
  transition: transform 1.2s ease;
}
.screen-action-dock {
  bottom: max(18px, env(safe-area-inset-bottom));
  display: flex;
  pointer-events: none;
  position: fixed;
  z-index: 24;
}
.screen-action-dock--left { left: clamp(20px, 3vw, 64px); }
.screen-action-dock--center { left: 50%; transform: translateX(-50%); }
.screen-action-dock--right { right: clamp(20px, 3vw, 64px); }
.screen-action-dock__button {
  border-radius: 16px !important;
  font-size: clamp(1rem, 0.22vw + 0.9rem, 1.2rem);
  min-height: 58px;
  min-width: 168px;
  pointer-events: auto;
}
.screen-action-dock__surface {
  align-items: center;
  backdrop-filter: blur(14px);
  background: rgba(var(--v-theme-surface), 0.94);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 22px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.28);
  display: flex;
  gap: 4px;
  padding: 7px;
  pointer-events: auto;
}
.screen-action-dock__compact {
  min-height: 56px;
  min-width: 56px;
}
.screen-action-dock__today {
  min-height: 56px;
  padding-inline: 14px;
}
.screen-action-dock__divider {
  align-self: stretch;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
  margin: 6px 4px;
  width: 1px;
}
.screen-toolbar { position: relative; z-index: 1; }
.screen-toolbar-content {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(220px, 1fr) max-content max-content;
  min-height: 82px;
  padding: 10px 16px;
}
.screen-class-block,
.screen-toolbar-actions {
  align-items: center;
  display: flex;
  gap: 10px;
}
.screen-class-block { min-width: 0; }
.screen-toolbar-actions {
  justify-content: flex-end;
  min-width: max-content;
}
.screen-identity { min-width: 150px; }
.screen-class-name { font-size: clamp(1.05rem, 0.25vw + 0.85rem, 1.35rem); }
.screen-toolbar :deep(.classroom-time-inline) {
  background: transparent;
  border: 0;
  border-left: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 0;
  border-right: 1px solid rgba(var(--v-theme-primary), 0.2);
  min-height: 54px;
  min-width: max-content;
  padding: 4px 22px;
}

@media (min-width: 2300px) {
  .screen-toolbar-content { padding: 12px 18px; }
}

@media (max-width: 1600px) {
  .screen-toolbar-content {
    gap: 12px;
    grid-template-columns: minmax(200px, 1fr) max-content max-content;
  }
  .screen-toolbar-actions {
    gap: 8px;
  }
  .screen-toolbar-action-label {
    display: none;
  }
  .screen-toolbar-actions :deep(.v-btn__prepend) {
    margin-inline: 0;
  }
}

@media (max-width: 1000px) {
  .screen-toolbar-content {
    grid-template-columns: minmax(0, 1fr) max-content;
  }
  .screen-toolbar :deep(.classroom-time-inline) {
    border-right: 0;
    padding-right: 0;
  }
  .screen-toolbar-actions {
    flex-wrap: wrap;
    grid-column: 1 / -1;
    justify-content: flex-end;
    min-width: 0;
  }
}

@media (max-width: 900px) {
  .classroom-screen-view { padding-bottom: 92px; }
  .screen-action-dock--left,
  .screen-action-dock--center,
  .screen-action-dock--right {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
  }
  .screen-action-dock__surface { padding: 5px; }
  .screen-action-dock__compact { min-height: 52px; min-width: 52px; }
  .screen-action-dock__today { display: none; }
  .screen-action-dock__button { min-height: 54px; min-width: 146px; }
}

@media (prefers-reduced-motion: reduce) {
  .classroom-screen-view { transition: none; }
}
</style>

<style>
body.classworks-screen-efficient .app-background-image {
  filter: none !important;
  transform: none !important;
  will-change: auto;
}

body.classworks-screen-active .md3-enter-active,
body.classworks-screen-active .md3-leave-active {
  transition-duration: 0.12s;
}
</style>
