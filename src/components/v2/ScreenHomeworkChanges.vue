<template>
  <v-card
    v-if="changes.length && !store.feedUsingCache && !store.feedLoadError"
    class="screen-homework-changes my-3 rounded-xl"
    color="warning"
    variant="tonal"
    :style="{'--change-font-scale': fontScale / 100}"
  >
    <v-card-text>
      <div
        class="d-flex align-center ga-2"
        role="status"
        aria-live="polite"
      >
        <v-icon icon="mdi-pencil-alert-outline" />
        <strong>作业有更新 · {{ changes.length }} 项，请核对已抄内容</strong>
        <v-spacer />
        <v-btn
          size="small"
          variant="text"
          @click="dismiss"
        >
          收起提示
        </v-btn>
      </div>
      <p class="text-caption mt-1">
        与这台大屏上次显示的内容比较；每项提示保留两分钟。完整记录可从作业的版本历史查看。
      </p>
      <div class="change-list">
        <details
          v-for="item in changes"
          :key="item.id"
          class="change-item mt-3"
          @toggle="reschedule"
        >
          <summary>
            <strong>{{ item.after.subject }} · 作业更正</strong>
            · {{ item.after.targets }} · {{ item.after.isCertified ? '教师已确认' : '待教师确认' }}
            <span
              v-for="field in item.changes"
              :key="field.key"
              class="change-summary"
            >
              {{ summary(field) }}
            </span>
            <span class="text-caption">展开查看完整前后内容</span>
          </summary>
          <div
            v-for="field in item.changes"
            :key="field.key"
            class="change-detail mt-2"
          >
            <strong>{{ field.label }}</strong>
            <p>{{ '原来：' + display(field.key, field.before) }}</p>
            <p>{{ '现在：' + display(field.key, field.after) }}</p>
          </div>
        </details>
      </div>
    </v-card-text>
  </v-card>
</template>
<script setup>
import {onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {createHomeworkChangeTracker, homeworkChangeSnapshot, homeworkChangeExcerpt} from "@/utils/homeworkChanges";
const store = useClassworksV2Store();
defineProps({fontScale: {type: Number, default: 100}});
const tracker = createHomeworkChangeTracker();
const changes = ref([]);
let timer;
function reschedule() {
  clearTimeout(timer);
  if (!changes.value.length) return;
  timer = setTimeout(() => { changes.value = tracker.current(); reschedule(); }, Math.max(0, Math.min(...changes.value.map(item => item.expiresAt)) - Date.now()) + 1);
}
function dismiss() { tracker.dismiss(); changes.value = []; clearTimeout(timer); }
watch(() => JSON.stringify([store.screenSession?.binding?.id, store.boardDate, store.activeWorkspaceIds, store.feedAudience]), () => {
  tracker.reset(); dismiss();
}, {flush: "sync"});
watch(() => [store.feed, store.feedLoading, store.feedGeneratedAt, store.feedUsingCache], () => {
  if (store.feedLoading || !store.feedGeneratedAt || (store.feedLoadError && !store.feedUsingCache)) return;
  changes.value = tracker.update(homeworkChangeSnapshot(store.feed, store.boardDate, store.activeWorkspaceIds), {cached: store.feedUsingCache});
  reschedule();
}, {immediate: true});
function display(key, value) {
  if (!value) return "（未设置）";
  if (key !== "dueAt") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"}).format(date);
}
function summary(field) {
  const excerpt = homeworkChangeExcerpt(display(field.key, field.before), display(field.key, field.after));
  return `${field.label}：${excerpt.before} → ${excerpt.after}`;
}
onUnmounted(() => clearTimeout(timer));
</script>
<style scoped>
.screen-homework-changes :deep(.v-card-text) { font-size: calc(1rem * var(--change-font-scale)); line-height: 1.6; }
.change-list { max-height: 40vh; overflow-y: auto; }
.change-summary { display: block; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4px 0; }
.change-detail p { white-space: pre-wrap; overflow-wrap: anywhere; }
.change-item { border-top: 1px solid currentColor; padding-top: 10px; }
.change-item summary { cursor: pointer; }
</style>
