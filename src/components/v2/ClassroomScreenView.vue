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
      <v-card-text class="d-flex align-center flex-wrap screen-toolbar-content">
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
        <v-spacer />
        <v-btn
          prepend-icon="mdi-monitor-eye"
          variant="tonal"
          @click="settingsDialog = true"
        >
          显示设置
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
    />

    <div class="screen-time-card">
      <ClassroomTimeCard compact />
    </div>

    <BoardDateNavigator
      class="mt-3"
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

    <ScreenDisplaySettingsDialog
      v-model="settingsDialog"
      :settings="settings"
      @save="applySettings"
    />
  </section>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import ClassroomTimeCard from "@/components/v2/ClassroomTimeCard.vue";
import OrganizedHomeworkFeed from "@/components/v2/OrganizedHomeworkFeed.vue";
import ScreenDisplaySettingsDialog from "@/components/v2/ScreenDisplaySettingsDialog.vue";
import UrgentNoticeBanner from "@/components/v2/UrgentNoticeBanner.vue";
import BoardDateNavigator from "@/components/v2/BoardDateNavigator.vue";
import {boardDateRelativeLabel} from "@/utils/boardDate";
import {classworksV2Api} from "@/utils/classworksV2Client";
import {
  loadScreenDisplaySettings,
  saveScreenDisplaySettings,
  sanitizeScreenDisplaySettings,
} from "@/utils/screenDisplaySettings";

defineEmits(["create", "edit", "history", "tools", "copy-board"]);
const store = useClassworksV2Store();
const settingsDialog = ref(false);
const settings = ref(loadScreenDisplaySettings(store.screenSession?.binding?.id));
const burnInStep = ref(0);
let burnInTimer = null;

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

watch(bindingId, (id) => {
  settings.value = loadScreenDisplaySettings(id);
}, {immediate: true});

watch(() => store.feed.filter((publication) => publication.type === "NOTICE")
  .map((publication) => `${publication.id}:${publication.revision}`).join(","), async () => {
  const items = store.feed.filter((publication) => publication.type === "NOTICE").map((publication) => ({
    publicationId: publication.id,
    revision: publication.revision,
    displayed: true,
  }));
  if (!items.length || !store.screenSession) return;
  try {
    await classworksV2Api.acknowledgeScreenNotifications(items);
  } catch {
    // 回执失败不应遮挡作业；下一次刷新会自动重试。
  }
}, {immediate: true});

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
  window.addEventListener("keydown", handleShortcut);
  burnInTimer = window.setInterval(() => {
    burnInStep.value += 1;
  }, 5 * 60 * 1000);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleShortcut);
  window.clearInterval(burnInTimer);
});
</script>

<style scoped>
.classroom-screen-view {
  width: calc(100% - 4px);
  margin: 2px;
  transition: transform 1.2s ease;
}
.screen-toolbar { position: sticky; top: 68px; z-index: 4; }
.screen-toolbar-content { gap: 10px; padding: 12px 16px; }
.screen-identity { min-width: 150px; }
.screen-class-name { font-size: 1.15rem; }
.screen-time-card { margin-top: 16px; }
@media (max-width: 900px) {
  .screen-toolbar { position: static; }
  .screen-toolbar-content { align-items: flex-start; }
}
</style>
