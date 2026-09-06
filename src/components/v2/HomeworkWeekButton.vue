<template>
  <v-btn
    v-if="!hideButton"
    :disabled="!store.activeWorkspaceIds.length"
    prepend-icon="mdi-calendar-week"
    variant="tonal"
    @click="open"
  >
    一周总览
  </v-btn>
  <v-dialog
    v-model="opened"
    max-width="1200"
    scrollable
  >
    <v-card class="homework-week-dialog rounded-xl">
      <v-card-title>{{ className }} · 一周总览</v-card-title>
      <v-card-text>
        <div class="d-flex align-center flex-wrap ga-2 mb-3">
          <v-btn
            aria-label="上一周"
            title="上一周"
            icon="mdi-chevron-left"
            variant="text"
            @click="start = shiftBoardDate(start, -7)"
          />
          <strong>{{ start }} 至 {{ shiftBoardDate(start, 6) }}</strong>
          <v-btn
            aria-label="下一周"
            title="下一周"
            icon="mdi-chevron-right"
            variant="text"
            @click="start = shiftBoardDate(start, 7)"
          />
          <v-btn
            variant="text"
            @click="start = homeworkWeekStart(todayBoardDate())"
          >
            本周
          </v-btn>
          <v-select
            v-model="view"
            class="week-select"
            density="compact"
            hide-details
            :items="[{title: '按作业板日期', value: 'board'}, {title: '按截止日期', value: 'due'}]"
            label="查看方式"
            variant="outlined"
          />
          <v-select
            v-model="subject"
            class="week-select"
            clearable
            density="compact"
            hide-details
            :items="subjects"
            label="筛选科目"
            variant="outlined"
          />
          <v-btn
            :loading="loading"
            prepend-icon="mdi-refresh"
            variant="text"
            @click="reload"
          >
            刷新总览
          </v-btn>
        </div>
        <p class="text-caption mb-3">
          {{ view === 'due' ? '包含作业板日期早于本周、但在本周截止的已发布作业；截止日期按北京时间归类，不含未设置截止时间的作业和无作业标记。' : '按所选班级范围查看本周已发布内容；没有记录不代表老师已确认无作业。' }}
        </p>
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          class="mb-3"
        >
          {{ error }}
        </v-alert>
        <v-progress-linear
          v-if="loading"
          indeterminate
        />
        <div
          v-else-if="!error"
          class="week-grid"
        >
          <section
            v-for="day in days"
            :key="day.date"
            class="week-day rounded-lg pa-3"
          >
            <h3>{{ day.date }} · {{ weekday(day.date) }}</h3>
            <p class="text-caption mb-2">
              {{ day.count }} 项作业 · {{ day.subjects }} 科
            </p>
            <v-alert
              v-if="hasNoHomeworkConflict(day.items, store.activeWorkspaceIds)"
              class="mb-2"
              type="warning"
              variant="tonal"
            >
              同科目作业与无作业标记并存，请核对。作业仍完整显示在下方。
            </v-alert>
            <p
              v-if="!day.items.length"
              class="text-medium-emphasis"
            >
              {{ view === 'due' ? '暂无已发布作业在本日截止' : '尚未录入' }}
            </p>
            <article
              v-for="item in day.items"
              :key="item.id"
              class="week-assignment py-2"
            >
              <strong>{{ item.subject?.name || '未指定科目' }} · {{ item.title || '作业' }}</strong>
              <p class="text-caption">
                {{ targetNames(item) }} · {{ item.isCertified ? '教师已确认' : '待教师确认' }}
              </p>
              <p class="week-content">
                {{ item.content }}
              </p>
              <p
                v-if="item.dueAt"
                class="text-caption"
              >
                截止：{{ deadlineLabel(item.dueAt) }}
              </p>
              <p
                v-if="view === 'due'"
                class="text-caption"
              >
                作业板日期：{{ String(item.boardDate).slice(0, 10) }}
              </p>
            </article>
          </section>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer /><v-btn @click="opened = false">
          关闭
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup>
import {computed, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {classworksV2Api, getClassroomScreenToken} from "@/utils/classworksV2Client";
import {groupHomeworkWeek, homeworkWeekStart, loadHomeworkWeek} from "@/utils/homeworkWeek";
import {shiftBoardDate, todayBoardDate} from "@/utils/boardDate";
import {hasNoHomeworkConflict} from "@/utils/noHomework";
const props = defineProps({className: {type: String, required: true}, hideButton: Boolean});
const store = useClassworksV2Store();
const opened = ref(false), start = ref(homeworkWeekStart(store.boardDate)), view = ref("board"), subject = ref("");
const items = ref([]), error = ref(""), loading = ref(false);
let controller, generation = 0;
const scope = computed(() => JSON.stringify([store.feedAudience, store.activeWorkspaceIds, store.screenSession?.binding?.id, props.className]));
const subjects = computed(() => [...new Map(items.value.map(item => [item.subjectId, {value: item.subjectId, title: item.subject?.name || item.subjectId}])).values()]);
const days = computed(() => groupHomeworkWeek(items.value, start.value, view.value, subject.value));
const weekday = date => new Intl.DateTimeFormat("zh-CN", {weekday: "short"}).format(new Date(`${date}T12:00:00`));
const deadlineLabel = date => new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"}).format(new Date(date));
const targetNames = item => (item.targets || []).filter(target => store.activeWorkspaceIds.includes(target.workspaceId)).map(target => target.workspace?.name || "所选教学班").join("、");
function cancel() { generation++; controller?.abort(); loading.value = false; }
function open() {
  if (!store.activeWorkspaceIds.length) return;
  start.value = homeworkWeekStart(store.boardDate); subject.value = ""; opened.value = true;
}
async function reload() {
  cancel();
  if (!opened.value) return;
  controller = new AbortController();
  const signal = controller.signal, current = generation, currentScope = scope.value, token = getClassroomScreenToken();
  const screen = store.feedAudience === "screen", workspaceIds = [...store.activeWorkspaceIds];
  error.value = ""; items.value = []; loading.value = true;
  const isCurrent = () => current === generation && scope.value === currentScope && token === getClassroomScreenToken();
  try {
    const result = await loadHomeworkWeek(params => classworksV2Api.publicationWeek(workspaceIds, params, {screen, signal}), {
      weekStart: start.value, weekView: view.value,
    }, signal);
    if (isCurrent()) {
      items.value = result;
      if (subject.value && !result.some(item => item.subjectId === subject.value)) subject.value = "";
    }
  } catch (failure) {
    if (isCurrent() && !signal.aborted) error.value = failure.response?.data?.message || failure.message || "一周总览加载失败，请重试。";
  } finally { if (current === generation) loading.value = false; }
}
watch([opened, start, view], () => { if (opened.value) void reload(); else { cancel(); items.value = []; } });
watch(scope, () => { opened.value = false; cancel(); items.value = []; });
onUnmounted(cancel);
defineExpose({open});
</script>
<style scoped>
.week-select { flex: 0 1 190px; min-width: 170px; }
.week-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.week-day { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); min-width: 0; }
.week-day h3 { font-size: 1rem; }
.week-assignment + .week-assignment { border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.week-content { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
