<template>
  <v-btn
    v-if="!hideButton"
    prepend-icon="mdi-calendar-range"
    variant="tonal"
    @click="open"
  >
    放假作业汇总
  </v-btn>
  <v-dialog
    v-model="opened"
    max-width="1050"
    scrollable
  >
    <v-card class="homework-holiday-dialog rounded-xl">
      <v-card-title>放假作业汇总 · {{ selectedClassName }}</v-card-title>
      <v-card-text>
        <v-select
          v-if="teacher"
          v-model="teacherWorkspace"
          :items="store.teacherWorkspaces"
          item-title="name"
          item-value="id"
          label="汇总班级"
        />
        <v-text-field
          v-model="title"
          label="清单名称"
          maxlength="60"
        />
        <div class="holiday-dates">
          <v-text-field
            v-model="start"
            type="date"
            label="假期开始"
          />
          <v-text-field
            v-model="end"
            type="date"
            label="假期结束"
          />
          <v-text-field
            v-model="searchStart"
            type="date"
            label="同时查找此日期起布置的作业"
          />
        </div>
        <p class="mb-3">
          默认选入假期内布置或截止的作业。假期前布置、未设置截止时间的作业请手动勾选；可向前调整查找日期。仅汇总已发布内容，勾选不修改原作业。
        </p>
        <v-btn
          :loading="loading"
          :disabled="!workspaceIds.length"
          @click="reload"
        >
          查找作业
        </v-btn>
        <v-alert
          v-if="error"
          class="my-3"
          type="error"
          variant="tonal"
        >
          {{ error }}
        </v-alert>
        <template v-if="loaded">
          <p class="my-3">
            已选 {{ selected.length }} / {{ items.length }} 项 · 按科目排列 · 数据更新于 {{ loadedAt?.toLocaleString('zh-CN') }}
          </p>
          <v-btn
            variant="text"
            @click="selected = items.map(item => item.id)"
          >
            全选
          </v-btn>
          <v-btn
            variant="text"
            @click="selected = []"
          >
            清空选择
          </v-btn>
          <p v-if="!items.length">
            此范围没有已发布作业。请调整日期后重试。
          </p>
          <article
            v-for="item in items"
            :key="item.id"
            class="holiday-assignment py-3"
          >
            <v-checkbox
              v-model="selected"
              :value="item.id"
              :label="`${item.subject?.name || '未指定科目'} · ${item.title || '作业'} · ${String(item.boardDate).slice(0, 10)}`"
              hide-details
            />
            <p>{{ item.isCertified ? '教师已确认' : '待教师确认' }} · 截止：{{ item.dueAt ? new Date(item.dueAt).toLocaleString('zh-CN') : '未设置' }}</p>
            <p class="holiday-content">
              {{ requiredHomeworkContent(item) }}
            </p>
            <SubmissionDetails :publication="item" /><PreparationDetails :publication="item" />
          </article>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn @click="opened = false">
          关闭
        </v-btn><v-spacer />
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
import {shiftBoardDate} from "@/utils/boardDate";
import {loadHolidayHomework, holidayDefaultSelection, holidayPrintSnapshot} from "@/utils/homeworkHoliday";
import {requiredHomeworkContent} from "@/utils/homeworkInstructions";
import SubmissionDetails from "./SubmissionDetails.vue";
import PreparationDetails from "./PreparationDetails.vue";
import HomeworkPrintButton from "./HomeworkPrintButton.vue";
const props = defineProps({hideButton: Boolean, className: {type: String, default: ""}, teacher: Boolean});
const store = useClassworksV2Store();
const opened = ref(false), loading = ref(false), error = ref(""), title = ref("放假作业汇总");
const start = ref(store.boardDate), end = ref(shiftBoardDate(store.boardDate, 6)), searchStart = ref(shiftBoardDate(store.boardDate, -14));
const items = ref([]), selected = ref([]), loaded = ref(false), loadedAt = ref(null), teacherWorkspace = ref("");
const workspaceIds = computed(() => props.teacher ? (teacherWorkspace.value ? [teacherWorkspace.value] : []) : store.activeWorkspaceIds);
const selectedClassName = computed(() => props.teacher ? store.teacherWorkspaces.find(w => w.id === teacherWorkspace.value)?.name || "请选择班级" : props.className);
const scope = computed(() => JSON.stringify([store.feedAudience, store.activeWorkspaceIds, store.screenSession?.binding?.id, store.account?.id, store.teacherSessionVersion, props.className]));
let controller, generation = 0;
function clear() { generation++; controller?.abort(); loading.value = false; loaded.value = false; items.value = []; selected.value = []; error.value = ""; }
function open() { start.value = store.boardDate; end.value = shiftBoardDate(start.value, 6); searchStart.value = shiftBoardDate(start.value, -14); opened.value = true; }
const snapshot = computed(() => loaded.value && selected.value.length ? holidayPrintSnapshot({items: items.value, selectedIds: selected.value,
  start: start.value, end: end.value, title: title.value, workspaceIds: workspaceIds.value, className: selectedClassName.value,
  scopeLabel: "放假作业汇总", generatedAt: loadedAt.value,
  warning: store.feedAudience === "screen" && (store.screenQueueReadError || store.screenPendingUploads.length) ? "本机待上传作业未包含在清单中，请核对同步状态。" : ""}) : null);
async function reload() {
  clear();
  if (!opened.value || !workspaceIds.value.length) return;
  const current = generation, token = getClassroomScreenToken();
  controller = new AbortController(); const signal = controller.signal;
  loading.value = true;
  try {
    const result = await loadHolidayHomework(params => classworksV2Api.publicationWeek([...workspaceIds.value], params,
      {screen: !props.teacher && store.feedAudience === "screen", signal}), {start: start.value, end: end.value, searchStart: searchStart.value}, signal);
    if (current !== generation || token !== getClassroomScreenToken()) return;
    items.value = result; selected.value = holidayDefaultSelection(result, start.value, end.value); loadedAt.value = new Date(); loaded.value = true;
  } catch (failure) { if (current === generation && !signal.aborted) error.value = failure.response?.data?.message || failure.message || "汇总加载失败，请重试。"; }
  finally { if (current === generation) loading.value = false; }
}
watch([start, end, searchStart, teacherWorkspace], clear, {flush: "sync"});
watch(opened, value => { if (!value) clear(); });
watch(scope, () => { opened.value = false; teacherWorkspace.value = ""; clear(); }, {flush: "sync"});
onUnmounted(clear);
defineExpose({open});
</script>
<style scoped>
.holiday-dates { display: flex; flex-wrap: wrap; gap: 12px; }
.holiday-dates > * { min-width: 220px; }
.holiday-content { white-space: pre-wrap; overflow-wrap: anywhere; }
.holiday-assignment { border-top: 1px solid #8885; }
</style>
