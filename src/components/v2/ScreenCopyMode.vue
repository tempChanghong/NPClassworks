<template>
  <v-dialog
    v-model="opened"
    fullscreen
    scrollable
    :retain-focus="!suspended"
    aria-label="作业抄写模式"
    @after-enter="measure"
    @after-leave="restore"
  >
    <v-card class="screen-copy-mode">
      <v-card-title class="copy-heading d-flex align-center flex-wrap ga-3">
        <h2>{{ current?.subject?.name || '抄写模式' }}</h2>
        <span class="text-body-1">第 {{ index + 1 }} / {{ items.length }} 项 · 第 {{ pageNumber }} / {{ pageCount }} 屏</span>
        <v-spacer />
        <v-btn
          prepend-icon="mdi-close"
          @click="opened = false"
        >
          退出抄写模式
        </v-btn>
      </v-card-title>
      <div
        v-if="current"
        class="copy-meta px-6 pb-3"
      >
        <p>{{ store.boardDate }} · {{ targets }}</p>
        <v-chip :color="current.isCertified ? 'success' : 'warning'">
          {{ current.isCertified ? '教师已确认' : '待教师确认' }}
        </v-chip>
        <span class="ml-3">{{ isNoHomework(current) ? '今日无作业' : `截止：${deadline}` }}</span>
        <p
          v-if="noHomeworkConflict"
          class="text-warning"
        >
          同科目还存在作业，请核对“今日无作业”标记，并继续查看其他作业。
        </p>
        <p
          v-if="store.feedUsingCache || !store.screenNetworkOnline || store.feedLoadError"
          class="text-warning"
        >
          当前为已加载内容，可能不是最新作业。
        </p>
        <p
          v-if="changed"
          class="text-warning"
        >
          作业内容有变化，已暂停并回到第一屏，请核对。
        </p>
        <p
          v-if="suspended"
          class="text-warning"
        >
          通知提示期间暂停轮播
        </p>
      </div>
      <v-divider />
      <v-card-text
        ref="viewport"
        class="copy-scroll"
        tabindex="0"
        aria-label="抄写正文"
        @scroll="measure"
        @wheel="pause"
        @touchstart="pause"
        @keydown="pause"
      >
        <div
          ref="body"
          class="copy-body"
          :style="{'--copy-scale': zoom * fontScale / 100}"
        >
          <h3
            v-if="current?.title"
            class="mb-4"
          >
            {{ current.title }}
          </h3>
          <div class="copy-content">
            {{ current?.content || '（正文为空，请参阅标题）' }}
          </div>
        </div>
      </v-card-text>
      <v-card-actions class="copy-controls px-5 ga-2">
        <v-btn @click="move(-1)">
          上一屏
        </v-btn>
        <v-btn @click="move(1)">
          下一屏
        </v-btn>
        <v-btn @click="move(1, true)">
          下一项作业
        </v-btn>
        <v-btn
          :disabled="suspended"
          color="primary"
          variant="tonal"
          @click="automatic = !automatic"
        >
          {{ automatic ? '暂停轮播' : '开始轮播' }}
        </v-btn>
        <v-select
          v-model="seconds"
          :items="[15, 20, 30, 45, 60]"
          label="每屏秒数"
          hide-details
          density="compact"
          style="max-width: 130px"
        />
        <v-btn
          :disabled="zoom <= 0.75"
          aria-label="缩小抄写字号"
          icon="mdi-format-font-size-decrease"
          @click="resize(-0.25)"
        />
        <v-btn
          :disabled="zoom >= 2"
          aria-label="放大抄写字号"
          icon="mdi-format-font-size-increase"
          @click="resize(0.25)"
        />
        <span class="text-caption">长正文可滚动；滚动会暂停轮播。每轮结束后从第一项继续。</span>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {hasNoHomeworkConflict, isNoHomework} from "@/utils/noHomework";

const props = defineProps({modelValue: Boolean, suspended: Boolean, fontScale: {type: Number, default: 100}});
const emit = defineEmits(["update:modelValue"]);
const opened = computed({get: () => props.modelValue, set: value => emit("update:modelValue", value)});
const store = useClassworksV2Store();
const items = computed(() => store.feed.filter(item => item.type === "ASSIGNMENT" && item.status === "PUBLISHED"
  && String(item.boardDate).slice(0, 10) === store.boardDate && item.targets?.some(t => store.activeWorkspaceIds.includes(t.workspaceId)))
  .slice().sort((a, b) => (a.subject?.name || "").localeCompare(b.subject?.name || "", "zh-CN") || a.id.localeCompare(b.id)));
const selected = ref(null), zoom = ref(1), seconds = ref(30), automatic = ref(false), changed = ref(false);
const viewport = ref(null), body = ref(null), pageNumber = ref(1), pageCount = ref(1), visible = ref(!document.hidden);
const index = computed(() => Math.max(0, items.value.findIndex(item => item.id === selected.value)));
const current = computed(() => items.value[index.value]);
const noHomeworkConflict = computed(() => current.value && isNoHomework(current.value) && hasNoHomeworkConflict(
  items.value.filter(item => item.subjectId === current.value.subjectId), store.activeWorkspaceIds));
const scope = computed(() => JSON.stringify([store.screenSession?.binding?.id, store.boardDate, store.activeWorkspaceIds, store.feedAudience]));
const targets = computed(() => current.value?.targets?.filter(t => store.activeWorkspaceIds.includes(t.workspaceId)).map(t => t.workspace?.name || "当前教学班").join("、"));
const deadline = computed(() => current.value?.dueAt && Number.isFinite(Date.parse(current.value.dueAt))
  ? new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"}).format(new Date(current.value.dueAt)) : "未设置");
const element = () => viewport.value?.$el || viewport.value;
// A full line overlaps between screens, so wrapped text at an edge is not lost.
const step = () => Math.max(1, (element()?.clientHeight || 1) - (body.value ? parseFloat(window.getComputedStyle(body.value).lineHeight) : 80));
function measure() {
  const el = element();
  if (!el) return;
  const distance = Math.max(0, el.scrollHeight - el.clientHeight);
  pageCount.value = Math.max(1, Math.ceil(distance / step()) + 1);
  pageNumber.value = el.scrollTop >= distance - 2 ? pageCount.value : Math.floor(el.scrollTop / step() + 0.01) + 1;
}
function pause() { automatic.value = false; }
async function move(direction, whole = false) {
  const el = element();
  if (!el || !items.value.length || props.suspended) return;
  const max = el.scrollHeight - el.clientHeight;
  if (!whole && ((direction > 0 && el.scrollTop < max - 2) || (direction < 0 && el.scrollTop > 2))) {
    el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + direction * step()));
  } else {
    selected.value = items.value[(index.value + direction + items.value.length) % items.value.length].id;
    await nextTick();
    if (!alive || !opened.value) return;
    el.scrollTop = direction < 0 ? el.scrollHeight : 0;
  }
  measure(); schedule();
}
function resize(amount) { zoom.value += amount; pause(); }
let timer, observer, position;
let alive = true;
function schedule() {
  clearTimeout(timer);
  if (alive && opened.value && automatic.value && visible.value && !props.suspended) timer = setTimeout(() => { void move(1); }, seconds.value * 1000);
}
function visibility() { visible.value = !document.hidden; }
function restore() {
  if (position?.scope === scope.value) {
    window.scrollTo({left: position.x, top: position.y, behavior: "instant"});
    if (position.activator?.isConnected) position.activator.focus({preventScroll: true});
  }
}
watch(automatic, value => { if (value) changed.value = false; });
watch([automatic, visible, () => props.suspended, seconds], schedule);
watch(scope, () => { position = null; pause(); opened.value = false; }, {flush: "sync"});
watch(() => JSON.stringify(items.value.map(item => [item.id, item.revision, item.title, item.content, item.dueAt, item.isCertified])), async (value, old) => {
  if (!opened.value) return;
  if (!items.value.length) { opened.value = false; return; }
  if (old && value !== old) { pause(); changed.value = true; await nextTick(); if (element()) element().scrollTop = 0; measure(); }
});
onMounted(async () => {
  position = {x: window.scrollX, y: window.scrollY, activator: document.activeElement, scope: scope.value};
  if (!items.value.length) { opened.value = false; return; }
  selected.value = items.value[0].id;
  document.addEventListener("visibilitychange", visibility);
  await nextTick();
  if (!alive) return;
  observer = new window.ResizeObserver(() => { measure(); schedule(); });
  if (element()) observer.observe(element());
  if (body.value) observer.observe(body.value);
});
onUnmounted(() => { alive = false; clearTimeout(timer); observer?.disconnect(); document.removeEventListener("visibilitychange", visibility); restore(); });
</script>
<style scoped>
.copy-heading { flex: 0 0 auto; white-space: normal; overflow-wrap: anywhere; }
.copy-heading h2 { font-size: clamp(1.5rem, 3vw, 3rem); }
.copy-meta { flex: 0 0 auto; max-height: 26vh; overflow: auto; font-size: clamp(1rem, 1.6vw, 1.8rem); }
.copy-scroll { min-height: 0; overscroll-behavior: contain; }
.copy-body { font-size: calc(clamp(1.75rem, 3vw, 3.5rem) * var(--copy-scale)); line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.copy-body h3 { font-size: inherit; }
.copy-controls { flex-wrap: wrap; flex: 0 0 auto; }
</style>
