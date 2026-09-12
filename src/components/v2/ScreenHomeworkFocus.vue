<template>
  <v-dialog
    v-model="opened"
    fullscreen
    scrollable
    aria-label="作业放大查看"
    @after-leave="restorePosition"
  >
    <v-card
      v-if="publication"
      class="screen-homework-focus"
      :style="{'--focus-scale': zoom * fontScale / 100}"
    >
      <v-card-title class="focus-heading d-flex align-center flex-wrap ga-3">
        <v-icon icon="mdi-book-open-page-variant" />
        <h2>{{ publication.subject?.name || '作业' }}</h2>
        <v-spacer />
        <v-btn
          prepend-icon="mdi-close"
          variant="tonal"
          @click="opened = false"
        >
          关闭放大
        </v-btn>
      </v-card-title>
      <div class="focus-meta px-6 pb-3">
        <p>{{ targetNames }} · {{ store.boardDate }}</p>
        <div class="d-flex flex-wrap align-center ga-3 mt-2">
          <v-chip
            :color="publication.isCertified ? 'success' : 'warning'"
            variant="tonal"
          >
            {{ publication.isCertified ? '教师已确认' : '待教师确认' }}
          </v-chip>
          <strong v-if="!isNoHomework(publication)">截止：{{ deadline }}</strong>
          <v-spacer />
          <v-btn
            :disabled="zoom <= 0.75"
            aria-label="缩小字号"
            icon="mdi-format-font-size-decrease"
            variant="text"
            @click="zoom = Math.max(0.75, zoom - 0.25)"
          />
          <v-btn
            :disabled="zoom >= 2"
            aria-label="放大字号"
            icon="mdi-format-font-size-increase"
            variant="text"
            @click="zoom = Math.min(2, zoom + 0.25)"
          />
        </div>
        <v-alert
          v-if="updated"
          class="mt-3"
          type="warning"
          variant="tonal"
        >
          作业信息已更新，当前显示最新内容，请核对已抄内容。
        </v-alert>
        <v-alert
          v-if="store.feedUsingCache || !store.screenNetworkOnline"
          class="mt-3"
          type="info"
          variant="tonal"
        >
          当前显示本机已加载的内容，离线时可能不是最新作业。
        </v-alert>
      </div>
      <v-divider />
      <v-card-text
        class="focus-scroll"
        tabindex="0"
        aria-label="放大作业正文，可滚动查看"
      >
        <h3
          v-if="publication.title"
          class="focus-title mb-5"
        >
          {{ publication.title }}
        </h3>
        <div class="focus-content">
          {{ publication.content || '（正文为空，请参阅标题）' }}
        </div>
        <PreparationDetails :publication="publication" />
      </v-card-text>
      <v-card-actions class="px-6">
        <span class="text-caption">长正文可滚动查看，按 Esc 或点击关闭返回作业板。</span>
        <v-spacer />
        <v-btn
          variant="text"
          @click="opened = false"
        >
          返回作业板
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup>
import PreparationDetails from "@/components/v2/PreparationDetails.vue";
import {computed, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {isNoHomework} from "@/utils/noHomework";

defineProps({fontScale: {type: Number, default: 100}});
const store = useClassworksV2Store();
const opened = ref(false), selectedId = ref(null), updated = ref(false), zoom = ref(1);
const scope = computed(() => JSON.stringify([store.screenSession?.binding?.id, store.boardDate, store.activeWorkspaceIds, store.feedAudience]));
const publication = computed(() => store.feed.find(item => item.id === selectedId.value && item.type === "ASSIGNMENT"
  && item.status === "PUBLISHED" && String(item.boardDate).slice(0, 10) === store.boardDate
  && item.targets?.some(target => store.activeWorkspaceIds.includes(target.workspaceId))) || null);
const targetNames = computed(() => (publication.value?.targets || []).filter(target => store.activeWorkspaceIds.includes(target.workspaceId))
  .map(target => target.workspace?.name || "当前教学班").join("、"));
const deadline = computed(() => {
  if (!publication.value?.dueAt) return "未设置";
  const date = new Date(publication.value.dueAt);
  return Number.isNaN(date.getTime()) ? "未设置" : new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", year: "numeric",
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"}).format(date);
});
let origin;
function open(item, activator) {
  selectedId.value = item.id;
  if (!publication.value) { selectedId.value = null; return; }
  origin = {activator, x: window.scrollX, y: window.scrollY, scope: scope.value};
  updated.value = false; zoom.value = 1; opened.value = true;
}
function restorePosition() {
  if (opened.value) return;
  selectedId.value = null;
  if (origin?.scope === scope.value) {
    window.scrollTo({left: origin.x, top: origin.y, behavior: "instant"});
    if (origin.activator?.isConnected) origin.activator.focus({preventScroll: true});
  }
  origin = null;
}
watch(scope, () => { opened.value = false; selectedId.value = null; origin = null; }, {flush: "sync"});
watch(publication, value => { if (opened.value && !value) opened.value = false; });
watch(() => publication.value ? JSON.stringify([publication.value.id, publication.value.title, publication.value.content,
  publication.value.dueAt, publication.value.subjectId, publication.value.isCertified, targetNames.value]) : null, (value, previous) => {
  if (opened.value && value && previous && JSON.parse(value)[0] === JSON.parse(previous)[0]) updated.value = true;
});
defineExpose({open});
</script>
<style scoped>
.focus-heading { flex: 0 0 auto; white-space: normal; overflow-wrap: anywhere; }
.focus-heading h2 { font-size: clamp(1.4rem, 2.5vw, 2.5rem); }
.focus-meta { flex: 0 0 auto; max-height: 35vh; overflow-y: auto; font-size: clamp(1rem, 1.4vw, 1.5rem); overflow-wrap: anywhere; }
.focus-scroll { min-height: 0; overscroll-behavior: contain; }
.focus-content, .focus-title { font-size: calc(clamp(1.75rem, 3vw, 3.5rem) * var(--focus-scale)); line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.screen-homework-focus :deep(.v-card-actions) { flex-wrap: wrap; }
</style>
