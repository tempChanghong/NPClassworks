<template>
  <section
    class="classroom-screen-view"
    :style="burnInStyle"
  >
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
          <v-btn
            prepend-icon="mdi-monitor-eye"
            variant="tonal"
            @click="$emit('settings')"
          >
            设置
          </v-btn>
          <v-btn
            prepend-icon="mdi-toolbox-outline"
            variant="tonal"
            @click="$emit('tools')"
          >
            课堂工具
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-monitor-edit"
            variant="elevated"
            @click="$emit('create')"
          >
            录入作业
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

    <v-alert
      v-if="store.screenError"
      class="mt-3"
      closable
      type="warning"
      variant="tonal"
    >
      {{ store.screenError }}
    </v-alert>

    <UrgentNoticeBanner
      :binding-id="bindingId"
      :notices="urgentNotices"
      :sound-enabled="settings.urgentNoticeSound"
      :system-notification-enabled="settings.backgroundSystemNotification"
      @acknowledge="acknowledgeNotice"
    />

    <BoardDateNavigator
      class="screen-date-navigator mt-3"
      can-copy-to-today
      :date="store.boardDate"
      @change="store.setBoardDate"
      @copy-to-today="$emit('copy-board')"
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
      />
    </div>

    <v-empty-state
      v-else
      class="mt-6"
      :headline="`${boardDateLabel}没有作业`"
      icon="mdi-check-circle-outline"
      text="本行政班及相关走班的作业会按日期出现在这里"
    />

    <div
      class="screen-action-dock"
      :class="`screen-action-dock--${settings.actionPosition}`"
    >
      <v-btn
        class="screen-action-dock__button"
        color="primary"
        elevation="8"
        prepend-icon="mdi-plus-circle-outline"
        rounded="xl"
        size="x-large"
        @click="$emit('create')"
      >
        录入作业
      </v-btn>
    </div>
  </section>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import ClassroomTimeCard from "@/components/v2/ClassroomTimeCard.vue";
import OrganizedHomeworkFeed from "@/components/v2/OrganizedHomeworkFeed.vue";
import UrgentNoticeBanner from "@/components/v2/UrgentNoticeBanner.vue";
import BoardDateNavigator from "@/components/v2/BoardDateNavigator.vue";
import ScreenSyncStatus from "@/components/v2/ScreenSyncStatus.vue";
import {boardDateRelativeLabel} from "@/utils/boardDate";
import {classworksV2Api} from "@/utils/classworksV2Client";
import {createNotificationDeliveryQueue} from "@/utils/notificationDeliveryQueue";
import {notificationAlertKey, readAcknowledgedNotificationKeys} from "@/utils/notificationAlerts";
import {
  loadScreenDisplaySettings,
  saveScreenDisplaySettings,
  sanitizeScreenDisplaySettings,
} from "@/utils/screenDisplaySettings";

defineEmits(["create", "edit", "history", "tools", "copy-board", "settings", "exit"]);
const store = useClassworksV2Store();
const settings = ref(loadScreenDisplaySettings(store.screenSession?.binding?.id));
const burnInStep = ref(0);
let burnInTimer = null;
const notificationDeliveryQueue = createNotificationDeliveryQueue({
  send: (items) => classworksV2Api.acknowledgeScreenNotifications(items),
});

const bindingId = computed(() => store.screenSession?.binding?.id || "");
const urgentNotices = computed(() => store.feed.filter((publication) =>
  publication.type === "NOTICE" && publication.priority === "URGENT",
));
const className = computed(() => store.screenSession?.binding?.administrativeClass?.name || "班级大屏");
const boardDateLabel = computed(() => boardDateRelativeLabel(store.boardDate));
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

watch(bindingId, (id) => {
  settings.value = loadScreenDisplaySettings(id);
}, {immediate: true});

watch(() => settings.value.performanceMode, updatePerformanceClass);

watch(() => store.feed.filter((publication) => publication.type === "NOTICE")
  .map((publication) => `${publication.id}:${publication.revision}`).join(","), () => {
  const acknowledged = readAcknowledgedNotificationKeys(bindingId.value);
  const items = store.feed.filter((publication) => publication.type === "NOTICE").map((publication) => ({
    publicationId: publication.id,
    revision: publication.revision,
    displayed: true,
    acknowledged: acknowledged.has(notificationAlertKey(publication)),
  }));
  if (!items.length || !store.screenSession) return;
  notificationDeliveryQueue.enqueue(items);
}, {immediate: true});

function acknowledgeNotice(publication) {
  if (!publication?.id || !store.screenSession) return;
  notificationDeliveryQueue.enqueue([{
    publicationId: publication.id,
    revision: publication.revision,
    displayed: true,
    acknowledged: true,
  }]);
}

function applySettings(value) {
  settings.value = saveScreenDisplaySettings(bindingId.value, value);
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
  window.addEventListener("online", notificationDeliveryQueue.retryNow);
  burnInTimer = window.setInterval(() => {
    burnInStep.value += 1;
  }, 5 * 60 * 1000);
});

onUnmounted(() => {
  document.body.classList.remove("classworks-screen-active");
  document.body.classList.remove("classworks-screen-efficient");
  window.removeEventListener("keydown", handleShortcut);
  window.removeEventListener("online", notificationDeliveryQueue.retryNow);
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
  bottom: 24px;
  display: flex;
  pointer-events: none;
  position: fixed;
  z-index: 20;
}
.screen-action-dock--left { left: clamp(20px, 3vw, 64px); }
.screen-action-dock--center { left: 50%; transform: translateX(-50%); }
.screen-action-dock--right { right: clamp(20px, 3vw, 64px); }
.screen-action-dock__button {
  font-size: clamp(1.05rem, 0.35vw + 0.9rem, 1.35rem);
  min-height: 68px;
  min-width: 210px;
  pointer-events: auto;
}
.screen-toolbar { position: relative; z-index: 1; }
.screen-toolbar-content {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(220px, 1fr) auto minmax(420px, 1fr);
  min-height: 82px;
  padding: 10px 16px;
}
.screen-class-block,
.screen-toolbar-actions {
  align-items: center;
  display: flex;
  gap: 10px;
}
.screen-toolbar-actions { justify-content: flex-end; }
.screen-identity { min-width: 150px; }
.screen-class-name { font-size: clamp(1.05rem, 0.25vw + 0.85rem, 1.35rem); }
.screen-toolbar :deep(.classroom-time-inline) {
  background: transparent;
  border: 0;
  border-left: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 0;
  border-right: 1px solid rgba(var(--v-theme-primary), 0.2);
  min-height: 54px;
  padding: 4px 22px;
}

@media (min-width: 2300px) {
  .screen-toolbar-content { padding: 12px 18px; }
}

@media (max-width: 1250px) {
  .screen-toolbar-content {
    grid-template-columns: 1fr auto;
  }
  .screen-toolbar :deep(.classroom-time-inline) {
    border-right: 0;
    padding-right: 0;
  }
  .screen-toolbar-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
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
