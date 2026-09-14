<template>
  <v-btn
    :disabled="!teacher && !store.activeWorkspaceIds.length"
    prepend-icon="mdi-bag-checked"
    variant="tonal"
    @click="open"
  >
    明日要交与需带
  </v-btn>
  <v-dialog
    v-model="opened"
    max-width="1000"
    scrollable
  >
    <v-card class="homework-tomorrow-dialog rounded-xl">
      <v-card-title>放学前核对 · {{ selectedClassName }}</v-card-title>
      <v-card-text>
        <v-select
          v-if="teacher"
          v-model="teacherWorkspace"
          :items="store.teacherWorkspaces"
          item-title="name"
          item-value="id"
          label="核对班级"
        />
        <p>按北京时间的实际明天汇总，与当前翻看的作业板日期无关。仅包含已发布内容，需联网读取。</p>
        <v-btn
          class="my-3"
          :loading="loading"
          :disabled="!workspaceIds.length"
          @click="reload"
        >
          刷新核对清单
        </v-btn>
        <v-alert
          v-if="error"
          type="warning"
          variant="tonal"
          class="my-3"
        >
          {{ error }}
        </v-alert>
        <template v-if="checklist">
          <p>明天 {{ checklist.tomorrow }} · 数据读取于 {{ tomorrowDeadline(loadedAt) }}</p>
          <p
            v-if="queueWarning"
            class="my-3"
          >
            {{ queueWarning }}
          </p>
          <section class="tomorrow-preparations my-4">
            <h2>明日需带 · {{ checklist.preparations.length }} 项</h2>
            <p v-if="!checklist.preparations.length">
              当前已发布内容中没有明日需带事项。
            </p>
            <article
              v-for="item in checklist.preparations"
              :key="item.id"
              class="tomorrow-row"
            >
              <h3>{{ item.subject }} · {{ item.targets }}</h3>
              <p>{{ item.certified ? '教师已确认' : '待教师确认' }}</p>
              <p class="tomorrow-content">
                {{ item.text }}
              </p>
            </article>
          </section>
          <p class="my-3">
            {{ TOMORROW_SCOPE_NOTE }}
          </p>
          <section
            v-for="section in sections"
            :key="section.key"
            :class="`tomorrow-${section.key} my-4`"
          >
            <h2>{{ section.title }} · {{ section.items.length }} 项</h2>
            <p v-if="!section.items.length">
              {{ section.empty }}
            </p>
            <article
              v-for="item in section.items"
              :key="item.id"
              class="tomorrow-row"
            >
              <h3>{{ item.subject?.name || '未指定科目' }}{{ item.title ? ' · ' + item.title : '' }}</h3>
              <p>{{ targetNames(item) }} · {{ item.isCertified ? '教师已确认' : '待教师确认' }} · 作业日期 {{ String(item.boardDate).slice(0, 10) }}</p>
              <p>截止：{{ item.dueAt ? tomorrowDeadline(item.dueAt) : '未设置，不能确定是否明天要交' }}</p>
              <p class="tomorrow-content">
                {{ requiredHomeworkContent(item) }}
              </p>
              <SubmissionDetails :publication="item" />
            </article>
          </section>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn @click="opened = false">
          关闭
        </v-btn>
        <v-spacer />
        <HomeworkPrintButton
          v-if="snapshot"
          :class-name="selectedClassName"
          :custom-snapshot="snapshot"
        />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup>
import {computed, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {classworksV2Api, getClassroomScreenToken} from "@/utils/classworksV2Client";
import {preparationToday} from "@/utils/homeworkPreparation";
import {loadTomorrowHomework, tomorrowPrintSnapshot, tomorrowDeadline, TOMORROW_SCOPE_NOTE} from "@/utils/homeworkTomorrow";
import {requiredHomeworkContent} from "@/utils/homeworkInstructions";
import {on as socketOn} from "@/utils/socketClient";
import SubmissionDetails from "./SubmissionDetails.vue";
import HomeworkPrintButton from "./HomeworkPrintButton.vue";

const props = defineProps({className: {type: String, default: ""}, teacher: Boolean});
const store = useClassworksV2Store();
const opened = ref(false), loading = ref(false), error = ref(""), checklist = ref(null), loadedAt = ref(null), teacherWorkspace = ref("");
const workspaceIds = computed(() => props.teacher ? (teacherWorkspace.value ? [teacherWorkspace.value] : []) : store.activeWorkspaceIds);
const selectedClassName = computed(() => props.teacher ? store.teacherWorkspaces.find(w => w.id === teacherWorkspace.value)?.name || "请选择班级" : props.className);
const scope = computed(() => JSON.stringify([store.feedAudience, store.activeWorkspaceIds, store.screenSession?.binding?.id, store.account?.id,
  store.teacherSessionVersion, store.teacherWorkspaces.map(w => w.id), props.className]));
const feedVersion = computed(() => JSON.stringify([store.feedLoadError, store.feedUsingCache, store.feed.filter(item => item.type === "ASSIGNMENT").map(item => [item.id, item.revision, item.status]),
  store.feedPreparations.map(item => [item.id, item.revision, item.status])]));
const queueWarning = computed(() => !props.teacher && store.feedAudience === "screen" && (store.screenQueueReadError || store.screenPendingUploads.length)
  ? "本机待上传作业未包含在清单中，请核对同步状态。" : "");
const sections = computed(() => checklist.value ? [
  {key: "due", title: "明日要交", items: checklist.value.due, empty: "当前已发布内容中没有明天截止的作业。"},
  {key: "unknown", title: "今日作业 · 截止未设置，请核对", items: checklist.value.unknown, empty: "今天作业板上没有需要核对截止时间的作业。"},
] : []);
const snapshot = computed(() => checklist.value ? tomorrowPrintSnapshot({checklist: checklist.value, workspaceIds: workspaceIds.value,
  className: selectedClassName.value, generatedAt: loadedAt.value, warning: queueWarning.value}) : null);
const targetNames = item => [...new Set((item.targets || []).filter(t => workspaceIds.value.includes(t.workspaceId)).map(t => t.workspace?.name || "所选教学班"))].join("、");
let controller, timer, generation = 0, requestedDay = "", subscriptions = [];
function clear() { generation++; controller?.abort(); checklist.value = null; loading.value = false; error.value = ""; requestedDay = ""; }
function open() { opened.value = true; if (workspaceIds.value.length) void reload(); }
async function reload() {
  clear();
  if (!opened.value || !workspaceIds.value.length) return;
  const current = generation, token = getClassroomScreenToken(), now = new Date(), ids = [...workspaceIds.value];
  const screen = !props.teacher && store.feedAudience === "screen";
  controller = new AbortController(); const signal = controller.signal;
  const isCurrent = () => current === generation && token === getClassroomScreenToken();
  requestedDay = preparationToday(now); loading.value = true;
  try {
    const result = await loadTomorrowHomework({now, workspaceIds: ids,
      loadDay: date => screen ? classworksV2Api.classroomScreenFeed(date, {signal, isCurrent}) : classworksV2Api.feed(ids, date, {signal, isCurrent}),
      loadWeek: params => classworksV2Api.publicationWeek(ids, params, {screen, signal}),
    }, signal);
    if (!isCurrent()) return;
    if (preparationToday() !== result.today) throw new Error("日期已变化，请刷新核对清单。");
    checklist.value = result; loadedAt.value = new Date();
  } catch (failure) {
    if (isCurrent() && !signal.aborted) {
      controller.abort();
      error.value = failure.response?.data?.message || failure.message || "清单加载失败，请联网后重试。";
    }
  } finally { if (current === generation) loading.value = false; }
}
function checkDate() {
  if (opened.value && requestedDay && requestedDay !== preparationToday()) {
    clear(); error.value = "日期已变化，请刷新核对清单。";
  }
}
function invalidate() {
  if (opened.value && (loading.value || checklist.value)) { clear(); error.value = "作业已变化或连接已恢复，请刷新核对清单。"; }
}
function unsubscribe() { subscriptions.forEach(stop => stop()); subscriptions = []; }
watch(opened, value => {
  clearInterval(timer);
  unsubscribe();
  if (value) {
    timer = setInterval(checkDate, 60_000);
    // The changed assignment may be older than the currently displayed board date.
    subscriptions = ["publication.created", "publication.updated", "publication.withdrawn", "publication.certified", "publication.restored", "connect"]
      .map(event => socketOn(event, payload => { if ((payload?.content || payload)?.publicationType !== "NOTICE") invalidate(); }));
  }
  else clear();
}, {flush: "sync"});
watch(teacherWorkspace, () => { clear(); if (opened.value) void reload(); }, {flush: "sync"});
watch(scope, () => { opened.value = false; teacherWorkspace.value = ""; clear(); }, {flush: "sync"});
watch(feedVersion, () => {
  if (opened.value && (loading.value || checklist.value)) { clear(); error.value = "作业已变化，请刷新核对清单。"; }
}, {flush: "sync"});
document.addEventListener("visibilitychange", checkDate);
onUnmounted(() => { clear(); clearInterval(timer); unsubscribe(); document.removeEventListener("visibilitychange", checkDate); });
</script>
<style scoped>
.tomorrow-content { white-space: pre-wrap; overflow-wrap: anywhere; }
.tomorrow-row { border-bottom: 1px solid #8885; padding: 12px 0; }
.homework-tomorrow-dialog :deep(.v-card-actions) { flex-wrap: wrap; gap: 8px; }
</style>
