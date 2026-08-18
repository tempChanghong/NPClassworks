<template>
  <div
    ref="gridContainer"
    class="homework-feed-grid"
    :class="{
      'screen-feed': screenMode,
      'screen-feed--compact': screenMode && settings.density === 'compact',
    }"
    :style="gridStyle"
  >
    <div
      v-for="publication in publications"
      :key="publication.id"
      ref="gridItems"
      class="publication-grid-item"
    >
      <v-card
        :color="publication.type === 'NOTICE' ? priorityColor(publication.priority) : undefined"
        class="publication-card rounded-xl"
        :class="[
          dueCardClass(publication),
          {'publication-card--completed': isCompleted(publication)},
        ]"
        :variant="publication.type === 'NOTICE' ? 'tonal' : screenMode ? 'flat' : 'elevated'"
      >
        <v-card-title class="publication-title d-flex align-center flex-wrap">
          <v-icon
            class="publication-icon"
            :icon="publication.type === 'NOTICE' ? 'mdi-bullhorn-outline' : 'mdi-book-open-page-variant'"
          />
          <span>{{ publication.subject?.name || "通知" }}</span>
          <span
            v-if="targetNames(publication)"
            class="target-name text-medium-emphasis"
          >
            {{ targetNames(publication) }}
          </span>
          <v-spacer />
          <v-chip
            v-if="isCompleted(publication)"
            color="success"
            prepend-icon="mdi-check-circle"
            size="small"
            title="完成状态仅保存在这台设备"
            variant="tonal"
          >
            本机已完成
          </v-chip>
          <v-chip
            :color="publication.isCertified ? 'success' : 'warning'"
            :size="screenMode ? 'x-small' : 'small'"
            variant="tonal"
          >
            <v-icon
              class="mr-1"
              :icon="publication.isCertified ? 'mdi-check-decagram' : 'mdi-alert-circle-outline'"
              :size="screenMode ? 'x-small' : 'small'"
            />
            {{ publication.isCertified ? "教师已确认" : "待教师确认" }}
          </v-chip>
          <v-chip
            :color="priorityColor(publication.priority)"
            :size="screenMode ? 'x-small' : 'small'"
            variant="tonal"
          >
            {{ priorityLabel(publication.priority) }}
          </v-chip>
        </v-card-title>
        <v-card-subtitle
          v-if="publication.title"
          class="publication-subtitle font-weight-bold"
        >
          {{ publication.title }}
        </v-card-subtitle>
        <v-card-text class="publication-body">
          <div class="publication-content">
            {{ publication.content }}
          </div>
          <v-divider class="publication-divider" />
          <div class="publication-metadata d-flex flex-wrap text-medium-emphasis">
            <span v-if="settings.showSecondaryMetadata">
              <v-icon
                :size="screenMode ? 'x-small' : 'small'"
                icon="mdi-account-outline"
              /> {{ publicationSource(publication) }}
            </span>
            <span v-if="settings.showSecondaryMetadata">
              <v-icon
                size="small"
                icon="mdi-clock-outline"
              /> {{ formatDateTime(publication.publishAt) }}
            </span>
            <span
              v-if="publication.type === 'ASSIGNMENT' && publication.dueAt"
            >
              <v-chip
                :color="dueState(publication)?.color"
                size="small"
                variant="tonal"
              >
                <v-icon
                  class="mr-1"
                  size="small"
                  :icon="dueState(publication)?.icon"
                />
                {{ dueState(publication)?.label }} {{ formatDateTime(publication.dueAt) }}
              </v-chip>
            </span>
            <span
              v-if="publication.type === 'NOTICE' && publication.expiresAt"
              class="font-weight-bold"
            >
              <v-icon
                size="small"
                icon="mdi-timer-sand"
              /> 显示至 {{ formatDateTime(publication.expiresAt) }}
            </span>
          </div>
          <div
            v-if="(screenMode && canEdit(publication)) || (completionEnabled && publication.type === 'ASSIGNMENT')"
            class="publication-actions d-flex justify-end"
          >
            <template v-if="screenMode && canEdit(publication)">
              <v-btn
                icon="mdi-history"
                size="small"
                title="版本历史"
                variant="text"
                @click="$emit('history', publication)"
              />
              <v-btn
                prepend-icon="mdi-pencil-outline"
                size="small"
                variant="tonal"
                @click="$emit('edit', publication)"
              >
                修改
              </v-btn>
            </template>
            <v-btn
              v-if="completionEnabled && publication.type === 'ASSIGNMENT'"
              :color="isCompleted(publication) ? 'success' : undefined"
              :prepend-icon="isCompleted(publication) ? 'mdi-check-circle' : 'mdi-check-circle-outline'"
              size="small"
              :variant="isCompleted(publication) ? 'tonal' : 'text'"
              @click="$emit('toggle-complete', publication)"
            >
              {{ isCompleted(publication) ? "取消完成" : "标记完成" }}
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {
  calculateScreenFeedColumns,
  SCREEN_DISPLAY_DEFAULTS,
  sanitizeScreenDisplaySettings,
} from "@/utils/screenDisplaySettings";
import {assignmentDueState} from "@/utils/publicationFeed";
import {isStudentHomeworkCompleted} from "@/utils/studentHomeworkCompletion";

const props = defineProps({
  publications: {type: Array, default: () => []},
  screenMode: Boolean,
  settings: {type: Object, default: () => ({...SCREEN_DISPLAY_DEFAULTS})},
  canEdit: {type: Function, default: () => false},
  currentTime: {type: [Date, Number, String], default: () => new Date()},
  completionEnabled: Boolean,
  completionRecords: {type: Object, default: () => ({})},
});
defineEmits(["edit", "history", "toggle-complete"]);

const gridContainer = ref(null);
const gridItems = ref([]);
const containerWidth = ref(0);
let resizeObserver;
let resizeFrame;
const resizeQueue = new Set();
const contentOwners = new WeakMap();

const normalizedSettings = computed(() => sanitizeScreenDisplaySettings(props.settings));
const gridStyle = computed(() => {
  const settings = normalizedSettings.value;
  const width = containerWidth.value || window.innerWidth;
  const autoColumns = calculateScreenFeedColumns(width, settings.fontScale);
  return {
    "--screen-font-scale": props.screenMode ? settings.fontScale / 100 : 1,
    "--feed-columns": settings.columns === "auto"
      ? `repeat(${autoColumns}, minmax(0, 1fr))`
      : `repeat(${settings.columns}, minmax(0, 1fr))`,
  };
});

function resizeGridItems(items) {
  const grid = gridContainer.value;
  if (!grid || !items.length) return;

  const styles = window.getComputedStyle(grid);
  const rowHeight = Number.parseFloat(styles.gridAutoRows) || 1;
  const rowGap = Number.parseFloat(styles.rowGap) || 0;
  const measurements = items.map((item) => ({
    item,
    height: item?.firstElementChild?.getBoundingClientRect().height || 0,
  }));
  measurements.forEach(({item, height}) => {
    if (item && height) item.style.gridRowEnd = `span ${Math.ceil((height + rowGap) / (rowHeight + rowGap))}`;
  });
}

function resizeAllGridItems() {
  scheduleResize(gridItems.value);
}

function scheduleResize(items) {
  items.forEach((item) => item && resizeQueue.add(item));
  if (resizeFrame) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null;
    const pending = [...resizeQueue];
    resizeQueue.clear();
    resizeGridItems(pending);
  });
}

async function observeGridItems() {
  await nextTick();
  if (!resizeObserver) return;
  resizeObserver.disconnect();
  if (gridContainer.value) {
    containerWidth.value = gridContainer.value.clientWidth;
    resizeObserver.observe(gridContainer.value);
  }
  gridItems.value.forEach((item) => {
    const content = item?.firstElementChild;
    if (content) {
      contentOwners.set(content, item);
      resizeObserver.observe(content);
    }
  });
  resizeAllGridItems();
}

onMounted(() => {
  resizeObserver = new window.ResizeObserver((entries) => {
    const changedItems = [];
    entries.forEach((entry) => {
      if (entry.target === gridContainer.value) {
        const width = Math.round(entry.contentRect.width);
        if (width !== containerWidth.value) containerWidth.value = width;
        changedItems.push(...gridItems.value);
      } else {
        changedItems.push(contentOwners.get(entry.target));
      }
    });
    scheduleResize(changedItems);
  });
  observeGridItems();
});

watch(() => props.publications.map((publication) => [
  publication.id,
  publication.revision,
  publication.title,
  publication.content,
  publication.isCertified,
  publication.dueAt,
  publication.targets?.map((target) => target.workspace?.name).join(","),
].join(":")).join("|"), observeGridItems);
watch(() => props.completionRecords, observeGridItems, {deep: true});
watch(gridStyle, () => nextTick(resizeAllGridItems));

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
});

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function priorityColor(priority) {
  return {URGENT: "error", IMPORTANT: "warning", NORMAL: "primary"}[priority] || "primary";
}

function priorityLabel(priority) {
  return {URGENT: "紧急", IMPORTANT: "重要", NORMAL: "普通"}[priority] || "普通";
}

function dueState(publication) {
  return assignmentDueState(publication.dueAt, new Date(props.currentTime));
}

function dueCardClass(publication) {
  const state = publication.type === "ASSIGNMENT" ? dueState(publication) : null;
  return state ? `publication-card--${state.key}` : "";
}

function isCompleted(publication) {
  return props.completionEnabled
    && isStudentHomeworkCompleted(publication, props.completionRecords);
}

function publicationSource(publication) {
  if (publication.latestActorType === "CLASSROOM_SCREEN") {
    return publication.latestScreenBinding?.name || "班级大屏";
  }
  return publication.author?.name || "教师";
}

function targetNames(publication) {
  return publication.targets?.map((target) => target.workspace?.name).filter(Boolean).join("、") || "";
}
</script>

<style scoped>
.homework-feed-grid {
  display: grid;
  gap: 20px;
  grid-auto-flow: dense;
  grid-auto-rows: 1px;
  align-items: start;
  grid-template-columns: var(--feed-columns, repeat(auto-fit, minmax(min(100%, 420px), 1fr)));
}

.publication-grid-item { min-width: 0; }

.publication-card {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.8));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.publication-card:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.11) !important; }
.publication-card--overdue { border-left: 4px solid rgb(var(--v-theme-error)); }
.publication-card--today,
.publication-card--soon { border-left: 4px solid rgb(var(--v-theme-warning)); }
.publication-card--completed {
  border-color: rgba(var(--v-theme-success), 0.55);
  background-image: linear-gradient(rgba(var(--v-theme-success), 0.035), rgba(var(--v-theme-success), 0.035));
}
.publication-card--completed .publication-content { color: rgba(var(--v-theme-on-surface), 0.72); }
.publication-title { gap: 8px; padding: 20px 20px 8px; }
.publication-icon { margin-right: 2px; }
.target-name { font-size: 0.75em; font-weight: 400; }
.publication-subtitle { padding: 0 20px; font-size: 1rem; white-space: normal; }
.publication-body { padding: 14px 20px 20px; }
.publication-content { font-size: 1rem; line-height: 1.8; overflow-wrap: anywhere; white-space: pre-wrap; }
.publication-divider { margin: 16px 0; }
.publication-metadata { font-size: 0.75rem; gap: 8px; }
.publication-actions { gap: 8px; margin-top: 14px; }

.screen-feed {
  gap: 16px;
}

.screen-feed .publication-title {
  font-size: clamp(0.95rem, 0.25vw + 0.72rem, 1.2rem);
  padding: 14px 18px 5px;
}

.screen-feed .publication-subtitle {
  font-size: 1rem;
  line-height: 1.4;
  padding: 0 18px;
}

.screen-feed .publication-body { padding: 12px 18px 18px; }
.screen-feed .publication-content { font-size: calc(1rem * var(--screen-font-scale)); line-height: 1.65; }
.screen-feed .publication-metadata { font-size: 0.75rem; }
.screen-feed .publication-card {
  box-shadow: none !important;
}
.screen-feed .publication-card:hover { box-shadow: none !important; }

.screen-feed--compact { gap: 10px; }
.screen-feed--compact .publication-title { padding-top: 10px; }
.screen-feed--compact .publication-body { padding-top: 6px; }
.screen-feed--compact .publication-divider { margin: 8px 0; }
.screen-feed--compact .publication-actions { margin-top: 6px; }

@media (max-width: 700px) {
  .homework-feed-grid { grid-template-columns: 1fr !important; }
}

@media (hover: none), (prefers-reduced-motion: reduce) {
  .publication-card { transition: none; }
}
</style>
