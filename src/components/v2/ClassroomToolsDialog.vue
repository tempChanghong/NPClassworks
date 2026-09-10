<template>
  <v-dialog
    :model-value="modelValue"
    fullscreen
    transition="dialog-bottom-transition"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-toolbar color="surface">
        <v-btn
          :icon="activeTool ? 'mdi-arrow-left' : 'mdi-close'"
          :title="activeTool ? '返回课堂工具' : '关闭'"
          @click="activeTool ? activeTool = '' : $emit('update:modelValue', false)"
        />
        <v-toolbar-title class="font-weight-bold">
          {{ activeToolTitle || "课堂工具" }}
        </v-toolbar-title>
        <v-spacer />
        <v-chip
          class="mr-4"
          color="primary"
          prepend-icon="mdi-account-group-outline"
          variant="tonal"
        >
          {{ store.screenSession?.binding?.administrativeClass?.name || store.selectedClassName }}
        </v-chip>
      </v-toolbar>

      <v-progress-linear
        v-if="store.classroomToolsLoading"
        indeterminate
      />

      <v-container class="classroom-tools-container py-8">
        <v-alert
          v-if="store.classroomToolsError"
          class="mb-5"
          closable
          type="error"
          variant="tonal"
          @click:close="store.classroomToolsError = ''"
        >
          {{ store.classroomToolsError }}
        </v-alert>

        <v-row v-if="!activeTool">
          <v-col
            v-for="tool in tools"
            :key="tool.id"
            cols="12"
            md="6"
          >
            <v-card
              class="tool-entry fill-height rounded-xl"
              :color="tool.color"
              variant="tonal"
              @click="openTool(tool.id)"
            >
              <v-card-text class="d-flex align-center pa-7">
                <v-avatar
                  class="mr-5"
                  :color="tool.color"
                  size="64"
                  variant="flat"
                >
                  <v-icon
                    :icon="tool.icon"
                    size="34"
                  />
                </v-avatar>
                <div>
                  <div class="text-h6 font-weight-bold">
                    {{ tool.title }}
                  </div>
                  <div class="text-body-2 text-medium-emphasis mt-1">
                    {{ tool.description }}
                  </div>
                </div>
                <v-spacer />
                <v-icon icon="mdi-chevron-right" />
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <v-empty-state
          v-if="!activeTool && !tools.length"
          headline="课堂工具已全部隐藏"
          icon="mdi-toolbox-outline"
          text="可以在大屏设置的“课堂工具”分类中重新启用。"
        />

        <template v-else-if="activeTool === 'attendance'">
          <v-alert
            v-if="!attendanceReady"
            class="mb-5"
            type="warning"
            variant="tonal"
          >
            {{ attendanceLoading ? '正在读取今日考勤，完成前不能编辑或保存。' : '尚未成功读取今日考勤，不能将当前状态当作全员到校。请重新读取后再编辑。' }}
            <v-btn
              class="ml-3"
              :loading="attendanceLoading"
              variant="text"
              @click="loadAttendance"
            >
              重新读取考勤
            </v-btn>
          </v-alert>
          <div class="d-flex align-center flex-wrap ga-3 mb-5">
            <v-chip
              v-if="attendanceReady"
              color="success"
              variant="tonal"
            >
              到校 {{ attendanceCounts.present }}
            </v-chip>
            <v-chip
              v-if="attendanceReady"
              color="error"
              variant="tonal"
            >
              缺勤 {{ attendanceCounts.absent }}
            </v-chip>
            <v-chip
              v-if="attendanceReady"
              color="warning"
              variant="tonal"
            >
              迟到 {{ attendanceCounts.late }}
            </v-chip>
            <v-chip
              v-if="attendanceReady"
              color="grey"
              variant="tonal"
            >
              不参与 {{ attendanceCounts.excluded }}
            </v-chip>
            <v-spacer />
            <v-btn
              :disabled="!attendanceReady || savingAttendance"
              prepend-icon="mdi-account-edit-outline"
              variant="tonal"
              @click="openRosterEditor"
            >
              编辑学生名单
            </v-btn>
            <v-btn
              color="primary"
              :disabled="!attendanceReady || savingRoster"
              :loading="savingAttendance"
              prepend-icon="mdi-content-save-check-outline"
              variant="elevated"
              @click="saveAttendance"
            >
              保存今日考勤
            </v-btn>
          </div>

          <v-empty-state
            v-if="attendanceReady && !store.classroomStudents.length"
            icon="mdi-account-school-outline"
            text="先录入行政班学生名单，之后即可记录每日考勤。"
            title="尚未录入学生名单"
          >
            <template #actions>
              <v-btn
                color="primary"
                prepend-icon="mdi-account-plus-outline"
                @click="openRosterEditor"
              >
                录入学生名单
              </v-btn>
            </template>
          </v-empty-state>

          <v-list
            v-else-if="attendanceReady"
            class="rounded-xl"
            lines="two"
          >
            <v-list-item
              v-for="student in store.classroomStudents"
              :key="student.id"
              class="student-row"
            >
              <template #prepend>
                <v-avatar
                  :color="statusColor(studentStatus(student.id))"
                  variant="tonal"
                >
                  {{ student.sortOrder + 1 }}
                </v-avatar>
              </template>
              <v-list-item-title class="font-weight-medium">
                {{ student.name }}
              </v-list-item-title>
              <v-list-item-subtitle v-if="student.studentNumber">
                学号 {{ student.studentNumber }}
              </v-list-item-subtitle>
              <template #append>
                <v-btn-toggle
                  :disabled="savingAttendance || savingRoster"
                  :model-value="studentStatus(student.id)"
                  color="primary"
                  mandatory
                  variant="outlined"
                  @update:model-value="setStudentStatus(student.id, $event)"
                >
                  <v-btn value="present">
                    到校
                  </v-btn>
                  <v-btn value="absent">
                    缺勤
                  </v-btn>
                  <v-btn value="late">
                    迟到
                  </v-btn>
                  <v-btn value="excluded">
                    不参与
                  </v-btn>
                </v-btn-toggle>
              </template>
            </v-list-item>
          </v-list>
        </template>

        <template v-else-if="activeTool === 'noise'">
          <v-row justify="center">
            <v-col
              cols="12"
            >
              <noise-monitor-card
                :binding-id="store.screenSession?.binding?.id || ''"
                expanded
              />
              <v-alert
                class="mt-5"
                type="info"
                variant="tonal"
              >
                噪声分析只在当前浏览器本地处理，不上传录音。首次启用时需要允许麦克风权限。
              </v-alert>
            </v-col>
          </v-row>
        </template>
      </v-container>

      <v-alert
        v-if="remoteRosterChanged"
        type="warning"
        class="ma-4"
      >
        班级名单已在其他设备更新，当前输入已保留。请重新载入并核对名单与考勤。
        <v-btn
          variant="text"
          @click="reloadChangedRoster"
        >
          重新载入名单与考勤
        </v-btn>
      </v-alert>
      <v-dialog
        v-model="rosterDialog"
        max-width="680"
      >
        <v-card class="rounded-xl">
          <v-card-title class="pa-5 pb-2">
            编辑行政班学生名单
          </v-card-title>
          <v-card-text class="px-5">
            <v-alert
              v-if="remoteRosterChanged"
              type="warning"
              class="mb-3"
            >
              名单已被远程修改，当前输入已保留，请先核对。
              <v-btn
                variant="text"
                @click="reloadChangedRoster"
              >
                重新载入名单与考勤
              </v-btn>
            </v-alert>
            <v-alert
              v-if="store.classroomToolsError"
              type="error"
              class="mb-3"
            >
              {{ store.classroomToolsError }}
            </v-alert>
            <v-alert
              class="mb-4"
              type="info"
              variant="tonal"
            >
              改名或修改学号请编辑下方学生行，以保留学生身份。批量导入可粘贴 Excel 的“学号、姓名”两列，或每行填写“学号 姓名”，默认保留其他学生。姓名不能为空；同名学生请填写不同学号，或逐项添加。
            </v-alert>
            <div
              v-for="(student, index) in rosterRows"
              :key="student.id || `new-${index}`"
              class="d-flex ga-2 mb-2"
            >
              <v-text-field
                v-model="student.studentNumber"
                :label="`学号 ${index + 1}`"
                :disabled="savingRoster"
                hide-details
              />
              <v-text-field
                v-model="student.name"
                :label="`姓名 ${index + 1}`"
                :disabled="savingRoster"
                hide-details
              />
              <v-btn
                icon="mdi-close"
                :aria-label="`移出第 ${index + 1} 人`"
                :disabled="savingRoster"
                @click="rosterRows.splice(index, 1)"
              />
            </div>
            <v-btn
              class="mb-3"
              :disabled="savingRoster"
              @click="rosterRows.push({name: '', studentNumber: ''})"
            >
              添加学生
            </v-btn>
            <v-textarea
              v-model="rosterText"
              :disabled="savingRoster"
              auto-grow
              label="批量追加名单"
              placeholder="01 张三&#10;02 李四&#10;03 王五"
              rows="4"
              variant="outlined"
            />
            <v-btn
              :disabled="savingRoster"
              @click="appendScreenRoster"
            >
              导入到名单
            </v-btn>
          </v-card-text>
          <v-card-actions class="px-5 pb-5">
            <v-spacer />
            <v-btn @click="rosterDialog = false">
              取消
            </v-btn>
            <v-btn
              color="primary"
              :loading="savingRoster"
              prepend-icon="mdi-content-save"
              @click="saveRoster"
            >
              保存名单
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, onUnmounted, ref, watch} from "vue";
import {useNow} from "@vueuse/core";
import {getClassroomScreenToken} from "@/utils/classworksV2Client";
import {useClassworksV2Store} from "@/stores/classworksV2";
import NoiseMonitorCard from "@/components/NoiseMonitorCard.vue";
import {loadClassroomToolSettings} from "@/utils/classroomToolSettings";
import {editableRoster, importRoster, rosterChanges, validateRoster} from "@/utils/classRoster";
import {confirmAction} from "@/utils/actionDialog";
import {classworksV2Api} from "@/utils/classworksV2Client";
import {on as socketOn, onConnect} from "@/utils/socketClient";

const props = defineProps({modelValue: Boolean, initialTool: {type: String, default: ""}});
defineEmits(["update:modelValue"]);
const store = useClassworksV2Store();
const activeTool = ref(props.initialTool);
const rosterDialog = ref(false);
const rosterText = ref("");
const rosterRows = ref([]);
const savingRoster = ref(false);
const savingAttendance = ref(false);
const rosterBase = ref([]), rosterBaseRevision = ref(null), remoteRosterChanged = ref(false);
const attendanceBaseline = ref("");
const hasAttendanceDraft = () => attendanceBaseline.value && JSON.stringify(attendanceDraft.value) !== attendanceBaseline.value;
const attendanceDraft = ref({absent: [], late: [], excluded: []});
const attendanceLoading = ref(false);
const attendanceLoadedScope = ref("");
let attendanceRequest = 0;
let toolsDisposed = false;
const clock = useNow({interval: 1000});
const toolSettings = ref(loadClassroomToolSettings(store.screenSession?.binding?.id));

const allTools = [
  {id: "attendance", title: "考勤", description: "记录今日缺勤、迟到和不参与学生", icon: "mdi-account-check-outline", color: "success"},
  {id: "noise", title: "噪声监测", description: "查看教室环境噪声和本地统计", icon: "mdi-waveform", color: "info"},
];
const tools = computed(() => allTools.filter((tool) => toolSettings.value.enabledToolIds.includes(tool.id)));

const today = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
const attendanceScope = () => store.screenSession?.binding?.id
  ? `${store.screenSession.binding.id}:${store.screenSession.binding.credentialVersion || 1}:${getClassroomScreenToken()}:${today()}` : "";
const attendanceReady = computed(() => {
  void clock.value;
  return Boolean(props.modelValue && !attendanceLoading.value && attendanceLoadedScope.value
    && !remoteRosterChanged.value
    && attendanceLoadedScope.value === attendanceScope());
});
const activeToolTitle = computed(() => tools.value.find((tool) => tool.id === activeTool.value)?.title || "");
const attendanceCounts = computed(() => {
  const attendance = attendanceForCurrentRoster(attendanceDraft.value);
  return {
    present: Math.max(0, store.classroomStudents.length
      - attendance.absent.length
      - attendance.late.length
      - attendance.excluded.length),
    absent: attendance.absent.length,
    late: attendance.late.length,
    excluded: attendance.excluded.length,
  };
});
watch(() => [props.modelValue, store.screenSession?.binding?.id, store.screenSession?.binding?.credentialVersion], ([open]) => {
  attendanceRequest++;
  attendanceLoadedScope.value = "";
  rosterDialog.value = false;
  remoteRosterChanged.value = false;
  if (!open) {
    activeTool.value = "";
    return;
  }
  toolSettings.value = loadClassroomToolSettings(store.screenSession?.binding?.id);
  void loadAttendance();
}, {immediate: true});
onUnmounted(() => { toolsDisposed = true; attendanceRequest++; });

async function loadAttendance() {
  if (toolsDisposed) return;
  if (savingAttendance.value || savingRoster.value) return;
  const request = ++attendanceRequest;
  const scope = attendanceScope();
  attendanceLoadedScope.value = "";
  if (!scope || !props.modelValue) return;
  attendanceLoading.value = true;
  try {
    const result = await store.loadClassroomTools(today());
    if (request !== attendanceRequest || scope !== attendanceScope() || !props.modelValue || !result) return;
    attendanceDraft.value = attendanceForCurrentRoster(result.attendance);
    attendanceBaseline.value = JSON.stringify(attendanceDraft.value);
    remoteRosterChanged.value = false;
    attendanceLoadedScope.value = scope;
  } catch {
    // The store exposes the load failure in the classroom tools alert.
  } finally {
    if (request === attendanceRequest) attendanceLoading.value = false;
  }
}

function attendanceForCurrentRoster(attendance) {
  const validIds = new Set(store.classroomStudents.map(student => student.id));
  const currentIds = key => (attendance[key] || []).filter(id => validIds.has(id));
  return {
    absent: currentIds("absent"),
    late: currentIds("late"),
    excluded: currentIds("excluded"),
  };
}

function openTool(id) {
  activeTool.value = id;
}

function studentStatus(studentId) {
  if (attendanceDraft.value.absent.includes(studentId)) return "absent";
  if (attendanceDraft.value.late.includes(studentId)) return "late";
  if (attendanceDraft.value.excluded.includes(studentId)) return "excluded";
  return "present";
}

function setStudentStatus(studentId, status) {
  if (!attendanceReady.value || savingAttendance.value || savingRoster.value) return;
  for (const key of ["absent", "late", "excluded"]) {
    attendanceDraft.value[key] = attendanceDraft.value[key].filter((id) => id !== studentId);
  }
  if (status !== "present") attendanceDraft.value[status].push(studentId);
}

function statusColor(status) {
  return {present: "success", absent: "error", late: "warning", excluded: "grey"}[status];
}

function openRosterEditor() {
  rosterBase.value = store.classroomStudents.map(s => ({...s}));
  rosterBaseRevision.value = store.classroomRosterRevision;
  rosterRows.value = editableRoster(store.classroomStudents);
  rosterText.value = "";
  rosterDialog.value = true;
}

function parseRoster() {
  if (rosterText.value.trim()) throw new Error("请先导入粘贴内容，或清空批量追加名单");
  return validateRoster(rosterRows.value);
}

function appendScreenRoster() {
  try { rosterRows.value = importRoster(rosterText.value, rosterRows.value); rosterText.value = ""; store.classroomToolsError = ""; }
  catch (e) { store.classroomToolsError = e.message; }
}

async function saveRoster() {
  if (savingRoster.value) return;
  const scope = attendanceScope();
  savingRoster.value = true;
  try {
    const students = parseRoster();
    if (!await confirmAction({title: "核对名单变更", message: rosterChanges(rosterBase.value, students).join("\n") || "名单没有变化", confirmText: "确认保存名单"})) return;
    if (scope !== attendanceScope()) return;
    await store.replaceClassroomStudents(students, rosterBaseRevision.value);
    if (scope !== attendanceScope()) return;
    attendanceDraft.value = attendanceForCurrentRoster(attendanceDraft.value);
    remoteRosterChanged.value = false;
    rosterDialog.value = false;
  } catch (error) {
    if (scope === attendanceScope()) store.classroomToolsError ||= error.message;
  } finally {
    savingRoster.value = false;
  }
}

async function saveAttendance() {
  if (!attendanceReady.value || attendanceLoadedScope.value !== attendanceScope() || savingAttendance.value || savingRoster.value) return;
  const scope = attendanceLoadedScope.value;
  const request = attendanceRequest;
  savingAttendance.value = true;
  try {
    const result = await store.saveClassroomAttendance(today(), attendanceForCurrentRoster(attendanceDraft.value));
    if (scope === attendanceScope() && request === attendanceRequest) {
      attendanceDraft.value = attendanceForCurrentRoster(result);
      attendanceBaseline.value = JSON.stringify(attendanceDraft.value);
    }
  } catch {
    // Keep the editable draft and the store's error for an explicit retry.
  } finally {
    savingAttendance.value = false;
  }
}

let checkingRoster = false;
async function checkRoster() {
  if (toolsDisposed || !props.modelValue || !attendanceLoadedScope.value || checkingRoster || savingRoster.value || savingAttendance.value || attendanceLoading.value) return;
  if (navigator.onLine === false || document.visibilityState === "hidden") return;
  const scope = attendanceScope();
  checkingRoster = true;
  try {
    const students = await classworksV2Api.classroomStudents();
    if (toolsDisposed || !props.modelValue || scope !== attendanceScope() || !students.rosterRevision || students.rosterRevision === store.classroomRosterRevision) return;
    if (rosterDialog.value || hasAttendanceDraft() || savingRoster.value || savingAttendance.value) remoteRosterChanged.value = true;
    else await loadAttendance();
  } catch { /* Retain the last successful state; retry on reconnect or next poll. */ }
  finally { checkingRoster = false; }
}
async function reloadChangedRoster() {
  if (!await confirmAction({title: "重新载入名单与考勤？", message: "当前未保存的名单和考勤修改会丢弃，请先复制保留需要的内容。", confirmText: "重新载入"})) return;
  rosterDialog.value = false;
  await loadAttendance();
}
const stopRosterEvent = socketOn("classroom.roster.updated", event => {
  if (event?.content?.administrativeClassId === store.screenSession?.binding?.administrativeClassId) void checkRoster();
});
const stopRosterConnect = onConnect(checkRoster);
window.addEventListener("online", checkRoster);
window.addEventListener("visibilitychange", checkRoster);
const rosterPoll = setInterval(checkRoster, 60000);
onUnmounted(() => {
  stopRosterEvent(); stopRosterConnect(); clearInterval(rosterPoll);
  window.removeEventListener("online", checkRoster);
  window.removeEventListener("visibilitychange", checkRoster);
});
</script>

<style scoped>
.classroom-tools-container {
  width: min(1180px, 100%);
}

.tool-entry {
  cursor: pointer;
  min-height: 138px;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.tool-entry:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.student-row + .student-row {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

@media (max-width: 720px) {
  .student-row :deep(.v-list-item__append) {
    align-self: stretch;
    margin-inline-start: 0;
    padding-top: 10px;
    width: 100%;
  }

  .student-row :deep(.v-list-item__content) {
    min-width: 120px;
  }
}
</style>
