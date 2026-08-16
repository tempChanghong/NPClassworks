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
          <div class="d-flex align-center flex-wrap ga-3 mb-5">
            <v-chip
              color="success"
              variant="tonal"
            >
              到校 {{ attendanceCounts.present }}
            </v-chip>
            <v-chip
              color="error"
              variant="tonal"
            >
              缺勤 {{ attendanceCounts.absent }}
            </v-chip>
            <v-chip
              color="warning"
              variant="tonal"
            >
              迟到 {{ attendanceCounts.late }}
            </v-chip>
            <v-chip
              color="grey"
              variant="tonal"
            >
              不参与 {{ attendanceCounts.excluded }}
            </v-chip>
            <v-spacer />
            <v-btn
              prepend-icon="mdi-account-edit-outline"
              variant="tonal"
              @click="openRosterEditor"
            >
              编辑学生名单
            </v-btn>
            <v-btn
              color="primary"
              :loading="savingAttendance"
              prepend-icon="mdi-content-save-check-outline"
              variant="elevated"
              @click="saveAttendance"
            >
              保存今日考勤
            </v-btn>
          </div>

          <v-empty-state
            v-if="!store.classroomStudents.length"
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
            v-else
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
              class="mb-4"
              type="info"
              variant="tonal"
            >
              每行一名学生；可填写“学号 姓名”，也可以只填写姓名。名单仅保存在学校服务器中供考勤使用。
            </v-alert>
            <v-textarea
              v-model="rosterText"
              auto-grow
              label="学生名单"
              placeholder="01 张三&#10;02 李四&#10;03 王五"
              rows="12"
              variant="outlined"
            />
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
import {computed, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import NoiseMonitorCard from "@/components/NoiseMonitorCard.vue";
import {loadClassroomToolSettings} from "@/utils/classroomToolSettings";

const props = defineProps({modelValue: Boolean});
defineEmits(["update:modelValue"]);
const store = useClassworksV2Store();
const activeTool = ref("");
const rosterDialog = ref(false);
const rosterText = ref("");
const savingRoster = ref(false);
const savingAttendance = ref(false);
const attendanceDraft = ref({absent: [], late: [], excluded: []});
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
const activeToolTitle = computed(() => tools.value.find((tool) => tool.id === activeTool.value)?.title || "");
const attendanceCounts = computed(() => ({
  present: Math.max(0, store.classroomStudents.length
    - attendanceDraft.value.absent.length
    - attendanceDraft.value.late.length
    - attendanceDraft.value.excluded.length),
  absent: attendanceDraft.value.absent.length,
  late: attendanceDraft.value.late.length,
  excluded: attendanceDraft.value.excluded.length,
}));
watch(() => props.modelValue, async (open) => {
  if (!open) {
    activeTool.value = "";
    return;
  }
  toolSettings.value = loadClassroomToolSettings(store.screenSession?.binding?.id);
  await store.loadClassroomTools(today());
  attendanceDraft.value = attendanceFromStore();
});

function attendanceFromStore() {
  return {
    absent: [...(store.classroomAttendance.absent || [])],
    late: [...(store.classroomAttendance.late || [])],
    excluded: [...(store.classroomAttendance.excluded || [])],
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
  for (const key of ["absent", "late", "excluded"]) {
    attendanceDraft.value[key] = attendanceDraft.value[key].filter((id) => id !== studentId);
  }
  if (status !== "present") attendanceDraft.value[status].push(studentId);
}

function statusColor(status) {
  return {present: "success", absent: "error", late: "warning", excluded: "grey"}[status];
}

function openRosterEditor() {
  rosterText.value = store.classroomStudents.map((student) =>
    [student.studentNumber, student.name].filter(Boolean).join(" "),
  ).join("\n");
  rosterDialog.value = true;
}

function parseRoster() {
  const existingByKey = new Map(store.classroomStudents.map((student) => [
    `${student.studentNumber || ""}\u0000${student.name}`,
    student,
  ]));
  return rosterText.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(\S+)\s+(.+)$/);
    const parsed = match
      ? {studentNumber: match[1], name: match[2].trim()}
      : {studentNumber: null, name: line};
    const existing = existingByKey.get(`${parsed.studentNumber || ""}\u0000${parsed.name}`);
    return {...parsed, id: existing?.id};
  });
}

async function saveRoster() {
  savingRoster.value = true;
  try {
    await store.replaceClassroomStudents(parseRoster());
    const validIds = new Set(store.classroomStudents.map((student) => student.id));
    for (const key of ["absent", "late", "excluded"]) {
      attendanceDraft.value[key] = attendanceDraft.value[key].filter((id) => validIds.has(id));
    }
    rosterDialog.value = false;
  } finally {
    savingRoster.value = false;
  }
}

async function saveAttendance() {
  savingAttendance.value = true;
  try {
    await store.saveClassroomAttendance(today(), attendanceDraft.value);
    attendanceDraft.value = attendanceFromStore();
  } finally {
    savingAttendance.value = false;
  }
}
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
