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

        <NpepScreenPairingCard
          v-else-if="activeTool === 'npep'"
          :key="`${store.screenSession?.binding?.id}:${store.screenSession?.binding?.credentialVersion}`"
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
              @click="retryAttendance"
            >
              重新读取考勤
            </v-btn>
          </v-alert>
          <section
            class="attendance-panel"
            aria-labelledby="attendance-title"
          >
            <div class="attendance-heading">
              <div>
                <span class="attendance-eyebrow">课堂记录 · {{ attendanceDateLabel }}</span>
                <h2 id="attendance-title">
                  今日考勤
                </h2>
                <p>点选每位学生的当前状态，完成后保存到学校记录。</p>
              </div>
              <v-chip
                v-if="attendanceReady"
                :color="hasAttendanceDraft() ? 'warning' : 'success'"
                variant="tonal"
              >
                {{ hasAttendanceDraft() ? '有未保存修改' : '当前记录已加载' }}
              </v-chip>
            </div>
            <div
              v-if="attendanceReady"
              class="attendance-metrics"
            >
              <div class="attendance-metric attendance-metric--present">
                <span>到校 </span><strong>{{ attendanceCounts.present }}</strong>
              </div>
              <div class="attendance-metric attendance-metric--absent">
                <span>缺勤 </span><strong>{{ attendanceCounts.absent }}</strong>
              </div>
              <div class="attendance-metric attendance-metric--late">
                <span>迟到 </span><strong>{{ attendanceCounts.late }}</strong>
              </div>
              <div class="attendance-metric attendance-metric--excluded">
                <span>不参与 </span><strong>{{ attendanceCounts.excluded }}</strong>
              </div>
            </div>
            <div class="attendance-actions">
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
          </section>

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

          <div
            v-else-if="attendanceReady"
            class="attendance-list"
            role="list"
          >
            <div
              v-for="student in store.classroomStudents"
              :key="student.id"
              class="student-row"
              role="listitem"
            >
              <div class="student-identity">
                <v-avatar
                  :color="statusColor(studentStatus(student.id))"
                  variant="tonal"
                >
                  {{ student.sortOrder + 1 }}
                </v-avatar>
                <div>
                  <strong>{{ student.name }}</strong>
                  <span v-if="student.studentNumber">学号 {{ student.studentNumber }}</span>
                </div>
              </div>
              <v-btn-toggle
                class="student-status"
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
            </div>
          </div>
        </template>

        <template v-else-if="activeTool === 'noise'">
          <v-row justify="center">
            <v-col
              cols="12"
            >
              <noise-monitor-card
                v-if="nativeNoiseState.provider === 'browser'"
                :binding-id="store.screenSession?.binding?.id || ''"
                expanded
              />
              <NativeNoisePanel v-else />
              <v-alert
                v-if="nativeNoiseState.provider === 'browser'"
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
        max-width="760"
        scrollable
      >
        <v-card class="roster-editor rounded-xl">
          <v-card-title class="roster-editor-header">
            <h2>编辑行政班学生名单</h2>
            <p>当前 {{ rosterRows.length }} 人 · 修改现有行可保留学生身份。</p>
          </v-card-title>
          <v-card-text class="roster-editor-content">
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
            <details class="roster-import">
              <summary>
                <span><strong>批量追加学生</strong><small>从 Excel 粘贴或逐行输入</small></span>
                <v-icon icon="mdi-chevron-down" />
              </summary>
              <div class="roster-import-body">
                <p>粘贴“学号、姓名”两列，或每行填写“学号 姓名”。导入默认保留其他学生；同名学生请填写不同学号。请在导入后核对，再保存名单。</p>
                <v-textarea
                  v-model="rosterText"
                  :disabled="savingRoster"
                  auto-grow
                  label="批量追加名单"
                  placeholder="01 张三&#10;02 李四&#10;03 王五"
                  rows="3"
                  variant="outlined"
                />
                <v-btn
                  :disabled="savingRoster"
                  variant="tonal"
                  @click="appendScreenRoster"
                >
                  导入到名单
                </v-btn>
              </div>
            </details>
            <div class="roster-list-heading">
              <div>
                <h3>逐人编辑</h3>
                <p>姓名不能为空；移出学生后，保存前仍可取消。</p>
              </div>
              <v-btn
                :disabled="savingRoster"
                variant="tonal"
                prepend-icon="mdi-account-plus-outline"
                @click="addRosterStudent"
              >
                添加学生
              </v-btn>
            </div>
            <div
              ref="rosterRowsElement"
              class="roster-rows"
            >
              <div
                v-for="(student, index) in rosterRows"
                :key="student.id || `new-${index}`"
                class="roster-row"
              >
                <span class="roster-row-index">{{ index + 1 }}</span>
                <v-text-field
                  v-model="student.studentNumber"
                  class="roster-row-number"
                  :label="`学号 ${index + 1}`"
                  :disabled="savingRoster"
                  variant="outlined"
                  hide-details
                />
                <v-text-field
                  v-model="student.name"
                  class="roster-row-name"
                  :label="`姓名 ${index + 1}`"
                  :disabled="savingRoster"
                  variant="outlined"
                  hide-details
                />
                <v-btn
                  class="roster-row-remove"
                  icon="mdi-close"
                  variant="text"
                  :aria-label="`移出第 ${index + 1} 人`"
                  :disabled="savingRoster"
                  @click="rosterRows.splice(index, 1)"
                />
              </div>
            </div>
          </v-card-text>
          <v-card-actions class="roster-editor-actions">
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
import {computed, nextTick, onUnmounted, ref, watch} from "vue";
import {useNow} from "@vueuse/core";
import {getClassroomScreenToken} from "@/utils/classworksV2Client";
import {useClassworksV2Store} from "@/stores/classworksV2";
import NoiseMonitorCard from "@/components/NoiseMonitorCard.vue";
import NativeNoisePanel from '@/components/v2/NativeNoisePanel.vue';
import NpepScreenPairingCard from '@/components/v2/NpepScreenPairingCard.vue';
import {nativeNoiseState} from '@/utils/nativeNoise';
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
const rosterRowsElement = ref(null);
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
const tools = computed(() => [...allTools.filter((tool) => toolSettings.value.enabledToolIds.includes(tool.id)),
  {id: 'npep', title: '连接 NPEduTools', description: '学校预授权与大屏配对', icon: 'mdi-link-variant', color: 'primary'}]);

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
const attendanceDateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', {month:'long',day:'numeric',weekday:'long'}).format(clock.value));
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

async function addRosterStudent() {
  rosterRows.value.push({name: '', studentNumber: ''});
  await nextTick();
  const input = rosterRowsElement.value?.lastElementChild?.querySelector('.roster-row-name input');
  input?.scrollIntoView({block: 'nearest'});
  input?.focus({preventScroll: true});
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
  const scope = attendanceScope();
  if (!await confirmAction({title: "重新载入名单与考勤？", message: "当前未保存的名单和考勤修改会丢弃，请先复制保留需要的内容。", confirmText: "重新载入"})) return;
  if (toolsDisposed || !props.modelValue || scope !== attendanceScope()) return;
  rosterDialog.value = false;
  await loadAttendance();
}
async function retryAttendance() {
  if (hasAttendanceDraft() || rosterDialog.value) return reloadChangedRoster();
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

.attendance-panel { margin-bottom: 20px; padding: 22px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 18px; }
.attendance-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.attendance-heading h2 { font-size: 24px; font-weight: 750; }
.attendance-heading p { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.attendance-eyebrow { color: rgb(var(--v-theme-primary)); font-size: 12px; font-weight: 800; letter-spacing: .06em; }
.attendance-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 20px; }
.attendance-metric { display: grid; gap: 4px; padding: 14px 16px; border-radius: 14px; background: rgba(var(--v-theme-on-surface), .045); }
.attendance-metric span { color: rgba(var(--v-theme-on-surface), .7); font-size: 13px; }
.attendance-metric strong { font-size: 28px; line-height: 1; }
.attendance-metric--absent strong { color: rgb(var(--v-theme-error)); }
.attendance-metric--late strong { color: rgb(var(--v-theme-warning)); }
.attendance-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.attendance-list { display: grid; gap: 10px; background: transparent; }
.student-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 14px; }
.student-identity { display: flex; align-items: center; gap: 12px; min-width: 0; }
.student-identity > div { display: grid; min-width: 0; }
.student-identity strong { overflow-wrap: anywhere; }
.student-identity span { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.student-status :deep(.v-btn) { min-height: 44px; }
.roster-editor { display: flex; flex-direction: column; max-height: min(90vh, 820px); max-height: min(90dvh, 820px); overflow: hidden; }
.roster-editor-header { display: grid; flex-shrink: 0; gap: 4px; padding: 20px 24px 14px; white-space: normal; }
.roster-editor-header h2 { font-size: 22px; font-weight: 750; }
.roster-editor-header p, .roster-list-heading p, .roster-import-body p { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.roster-editor-content { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px 20px !important; }
.roster-import { border: 1px solid rgba(var(--v-border-color), .22); border-radius: 12px; }
.roster-import summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; cursor: pointer; }
.roster-import summary::marker { content: ''; }
.roster-import summary span { display: grid; gap: 3px; }
.roster-import summary small { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.roster-import[open] summary .v-icon { transform: rotate(180deg); }
.roster-import-body { padding: 0 16px 16px; }
.roster-import-body p { margin-bottom: 14px; }
.roster-list-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 20px 0 12px; }
.roster-list-heading h3 { font-size: 17px; font-weight: 750; }
.roster-rows { display: grid; gap: 8px; }
.roster-row { display: grid; grid-template-columns: 28px minmax(0, .8fr) minmax(0, 1.2fr) 44px; align-items: center; gap: 8px; padding: 10px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 12px; }
.roster-row-index { color: rgba(var(--v-theme-on-surface), .68); font-weight: 700; text-align: center; }
.roster-editor-actions { flex-shrink: 0; padding: 12px 24px 20px; border-top: 1px solid rgba(var(--v-border-color), .16); }
@media (min-width: 1200px) {
  .attendance-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .attendance-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .attendance-panel { padding: 16px; }
  .attendance-heading { display: grid; }
  .attendance-heading :deep(.v-chip) { justify-self: start; }
  .attendance-actions :deep(.v-btn) { width: 100%; }
  .student-row { grid-template-columns: 1fr; }
  .student-status { display: flex; width: 100%; }
  .student-status :deep(.v-btn) { flex: 1 1 0; min-width: 0; padding-inline: 4px; }
  .roster-editor-header { padding: 18px 18px 12px; }
  .roster-editor-content { padding: 0 18px 18px !important; }
  .roster-list-heading { align-items: flex-start; }
  .roster-list-heading :deep(.v-btn) { min-width: 100px; }
  .roster-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .roster-row-index { grid-column: 1; grid-row: 1; justify-self: start; padding-left: 4px; }
  .roster-row-remove { grid-column: 2; grid-row: 1; justify-self: end; }
  .roster-row-number { grid-column: 1 / -1; grid-row: 2; }
  .roster-row-name { grid-column: 1 / -1; grid-row: 3; }
  .roster-row-number, .roster-row-name { min-width: 0; }
  .roster-editor-actions { padding: 12px 18px 18px; }
}
</style>
