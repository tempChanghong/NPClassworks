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
        :class="dueCardClass(publication)"
        :variant="publication.type === 'NOTICE' ? 'tonal' : 'elevated'"
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
            :color="publication.isCertified ? 'success' : 'warning'"
            size="small"
            variant="tonal"
          >
            <v-icon
              class="mr-1"
              :icon="publication.isCertified ? 'mdi-check-decagram' : 'mdi-alert-circle-outline'"
              size="small"
            />
            {{ publication.isCertified ? "教师已确认" : "待教师确认" }}
          </v-chip>
          <v-chip
            :color="priorityColor(publication.priority)"
            size="small"
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
                size="small"
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
            v-if="screenMode && canEdit(publication)"
            class="publication-actions d-flex justify-end"
          >
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
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {SCREEN_DISPLAY_DEFAULTS, sanitizeScreenDisplaySettings} from "@/utils/screenDisplaySettings";
import {assignmentDueState} from "@/utils/publicationFeed";

const props = defineProps({
  publications: {type: Array, default: () => []},
  screenMode: Boolean,
  settings: {type: Object, default: () => ({...SCREEN_DISPLAY_DEFAULTS})},
  canEdit: {type: Function, default: () => false},
});
defineEmits(["edit", "history"]);

const gridContainer = ref(null);
const gridItems = ref([]);
const now = ref(new Date());
let resizeObserver;
let clockTimer;

const normalizedSettings = computed(() => sanitizeScreenDisplaySettings(props.settings));
const gridStyle = computed(() => {
  const settings = normalizedSettings.value;
  const minWidth = Math.round(360 * (settings.fontScale / 100));
  return {
    "--screen-font-scale": props.screenMode ? settings.fontScale / 100 : 1,
    "--feed-columns": settings.columns === "auto"
      ? `repeat(auto-fit, minmax(min(100%, ${minWidth}px), 1fr))`
      : `repeat(${settings.columns}, minmax(0, 1fr))`,
  };
});

function resizeGridItem(item) {
  const grid = gridContainer.value;
  const content = item?.firstElementChild;
  if (!grid || !content) return;

  const styles = window.getComputedStyle(grid);
  const rowHeight = Number.parseFloat(styles.gridAutoRows) || 1;
  const rowGap = Number.parseFloat(styles.rowGap) || 0;
  const contentHeight = content.getBoundingClientRect().height;
  item.style.gridRowEnd = `span ${Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap))}`;
}

function resizeAllGridItems() {
  gridItems.value.forEach(resizeGridItem);
}

async function observeGridItems() {
  await nextTick();
  if (!resizeObserver) return;
  resizeObserver.disconnect();
  if (gridContainer.value) resizeObserver.observe(gridContainer.value);
  gridItems.value.forEach((item) => {
    const content = item?.firstElementChild;
    if (content) resizeObserver.observe(content);
  });
  resizeAllGridItems();
}

onMounted(() => {
  resizeObserver = new window.ResizeObserver(resizeAllGridItems);
  clockTimer = window.setInterval(() => {
    now.value = new Date();
  }, 60_000);
  observeGridItems();
});

watch(() => props.publications, observeGridItems, {deep: true});
watch(gridStyle, () => nextTick(resizeAllGridItems));

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.clearInterval(clockTimer);
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
  return assignmentDueState(publication.dueAt, now.value);
}

function dueCardClass(publication) {
  const state = publication.type === "ASSIGNMENT" ? dueState(publication) : null;
  return state ? `publication-card--${state.key}` : "";
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
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.publication-card:hover { transform: translateY(-2px); }
.publication-card--overdue { border-left: 4px solid rgb(var(--v-theme-error)); }
.publication-card--today,
.publication-card--soon { border-left: 4px solid rgb(var(--v-theme-warning)); }
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
  font-size: 1.15rem;
  padding: 16px 18px 6px;
}

.screen-feed .publication-subtitle {
  font-size: 1rem;
  line-height: 1.4;
  padding: 0 18px;
}

.screen-feed .publication-body { padding: 12px 18px 18px; }
.screen-feed .publication-content { font-size: calc(1rem * var(--screen-font-scale)); line-height: 1.65; }
.screen-feed .publication-metadata { font-size: 0.75rem; }

.screen-feed--compact { gap: 10px; }
.screen-feed--compact .publication-title { padding-top: 10px; }
.screen-feed--compact .publication-body { padding-top: 6px; }
.screen-feed--compact .publication-divider { margin: 8px 0; }
.screen-feed--compact .publication-actions { margin-top: 6px; }

@media (max-width: 700px) {
  .homework-feed-grid { grid-template-columns: 1fr !important; }
}
</style>
