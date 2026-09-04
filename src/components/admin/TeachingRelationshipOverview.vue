<template>
  <v-card class="relationship-overview mb-5 rounded-xl">
    <v-card-title class="d-flex flex-wrap align-center ga-3 pa-5 pb-2">
      <v-icon
        color="primary"
        icon="mdi-graph-outline"
      />
      <div>
        <div>年级教学关系总览</div>
        <div class="text-body-2 text-medium-emphasis font-weight-regular">
          在一张表中核对行政班授课方式、走班覆盖和明确任课关系
        </div>
      </div>
      <v-spacer />
      <v-btn
        :loading="loading"
        prepend-icon="mdi-refresh"
        variant="tonal"
        @click="loadOverview"
      >
        刷新
      </v-btn>
    </v-card-title>

    <v-card-text class="pa-5 pt-3">
      <v-alert
        v-if="errorMessage"
        class="mb-4"
        closable
        type="error"
        variant="tonal"
        @click:close="errorMessage = ''"
      >
        {{ errorMessage }}
      </v-alert>
      <v-alert
        v-if="successMessage"
        class="mb-4"
        closable
        type="success"
        variant="tonal"
        @click:close="successMessage = ''"
      >
        {{ successMessage }}
      </v-alert>

      <v-row class="mb-1">
        <v-col
          v-for="item in summaryItems"
          :key="item.label"
          cols="6"
          lg="2"
          sm="4"
        >
          <div class="summary-tile">
            <v-icon
              :color="item.color"
              :icon="item.icon"
              size="22"
            />
            <div>
              <div class="text-h6 font-weight-bold">
                {{ item.value }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ item.label }}
              </div>
            </div>
          </div>
        </v-col>
      </v-row>

      <div class="d-flex flex-wrap align-center ga-3 mb-4">
        <v-select
          v-model="selectedGradeId"
          class="grade-select"
          density="comfortable"
          hide-details
          :items="gradeOptions"
          item-title="title"
          item-value="value"
          label="年级"
          variant="outlined"
        />
        <v-chip
          color="primary"
          prepend-icon="mdi-home-account"
          variant="tonal"
        >
          随班
        </v-chip>
        <v-chip
          color="secondary"
          prepend-icon="mdi-transit-connection-horizontal"
          variant="tonal"
        >
          走班
        </v-chip>
        <v-chip
          prepend-icon="mdi-minus-circle-outline"
          variant="tonal"
        >
          不开课
        </v-chip>
      </div>

      <v-progress-linear
        v-if="loading"
        class="mb-4"
        indeterminate
        rounded
      />

      <v-tabs
        v-model="section"
        class="mb-3"
        color="primary"
      >
        <v-tab value="matrix">
          关系矩阵
        </v-tab>
        <v-tab value="teachers">
          按教师分配
        </v-tab>
        <v-tab value="diagnostics">
          配置诊断
          <v-badge
            v-if="visibleDiagnostics.length"
            class="ml-3"
            color="warning"
            :content="visibleDiagnostics.length"
            inline
          />
        </v-tab>
      </v-tabs>

      <v-window
        v-model="section"
        :touch="false"
      >
        <v-window-item value="matrix">
          <div
            v-if="visibleAdministrativeClasses.length"
            class="matrix-scroll"
          >
            <table class="relationship-matrix">
              <thead>
                <tr>
                  <th class="class-column">
                    行政班
                  </th>
                  <th
                    v-for="subject in visibleSubjects"
                    :key="subject.id"
                  >
                    {{ subject.name }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="administrativeClass in visibleAdministrativeClasses"
                  :key="administrativeClass.id"
                >
                  <th class="class-column">
                    <div class="font-weight-bold">
                      {{ administrativeClass.name }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ administrativeClass.code }}
                      <span v-if="administrativeClass._count?.classroomScreens">
                        · 已绑定大屏
                      </span>
                    </div>
                  </th>
                  <td
                    v-for="subject in visibleSubjects"
                    :key="subject.id"
                  >
                    <template v-if="subjectRule(administrativeClass, subject.id)?.deliveryMode === 'ADMIN_CLASS'">
                      <button
                        class="cell-editor"
                        type="button"
                        @click="openAdministrativeClassAssignment(administrativeClass, subject)"
                      >
                        <span class="d-flex align-center justify-space-between ga-2">
                          <v-chip
                            color="primary"
                            size="small"
                            variant="tonal"
                          >
                            随行政班
                          </v-chip>
                          <v-icon
                            icon="mdi-pencil-outline"
                            size="16"
                          />
                        </span>
                        <span
                          class="teacher-line"
                          :class="{'text-warning': !subjectRule(administrativeClass, subject.id).assignments.length}"
                        >
                          {{ assignmentNames(subjectRule(administrativeClass, subject.id).assignments) }}
                        </span>
                      </button>
                    </template>
                    <template v-else-if="subjectRule(administrativeClass, subject.id)?.deliveryMode === 'COURSE_GROUP'">
                      <v-chip
                        color="secondary"
                        size="small"
                        variant="tonal"
                      >
                        走班
                      </v-chip>
                      <div
                        v-if="coveringGroups(administrativeClass.id, subject.id).length"
                        class="group-list"
                      >
                        <button
                          v-for="group in coveringGroups(administrativeClass.id, subject.id)"
                          :key="group.id"
                          class="group-editor"
                          type="button"
                          @click="openCourseGroupAssignment(group)"
                        >
                          <span class="font-weight-medium">{{ group.name }}</span>
                          <span class="text-medium-emphasis"> · {{ assignmentNames(group.assignments) }}</span>
                          <v-icon
                            icon="mdi-pencil-outline"
                            size="14"
                          />
                        </button>
                      </div>
                      <div
                        v-else
                        class="teacher-line text-error"
                      >
                        无教学班覆盖
                      </div>
                    </template>
                    <div
                      v-else
                      class="not-offered"
                    >
                      <v-icon
                        icon="mdi-minus"
                        size="18"
                      />
                      不开课
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <v-empty-state
            v-else-if="!loading"
            icon="mdi-table-off"
            text="当前年级还没有行政班"
            title="暂无教学关系"
          />
        </v-window-item>

        <v-window-item value="teachers">
          <v-row>
            <v-col
              cols="12"
              lg="5"
            >
              <v-card
                class="rounded-lg"
                variant="tonal"
              >
                <v-card-title class="text-subtitle-1">
                  批量添加任课
                </v-card-title>
                <v-card-text>
                  <v-autocomplete
                    v-model="batchForm.accountId"
                    :items="teacherOptions"
                    item-title="title"
                    item-value="value"
                    label="教师"
                    variant="outlined"
                  />
                  <v-select
                    v-model="batchForm.subjectId"
                    :items="subjectOptions"
                    item-title="title"
                    item-value="value"
                    label="科目"
                    variant="outlined"
                  />
                  <v-select
                    v-model="batchForm.workspaceIds"
                    chips
                    closable-chips
                    :disabled="!batchForm.subjectId"
                    hint="可选择随班授课的行政班和同科走班教学班"
                    :items="eligibleWorkspaceOptions"
                    item-title="title"
                    item-value="value"
                    label="行政班或走班教学班"
                    multiple
                    persistent-hint
                    variant="outlined"
                  />
                  <v-select
                    v-model="batchForm.position"
                    :items="positionOptions"
                    item-title="title"
                    item-value="value"
                    label="任课身份"
                    variant="outlined"
                  />
                  <v-btn
                    block
                    color="primary"
                    :disabled="!batchCanSave"
                    :loading="savingAssignment"
                    prepend-icon="mdi-account-multiple-plus-outline"
                    @click="saveBatchAssignments"
                  >
                    添加到所选教学单元
                  </v-btn>
                </v-card-text>
              </v-card>
            </v-col>
            <v-col
              cols="12"
              lg="7"
            >
              <v-card
                class="rounded-lg"
                variant="outlined"
              >
                <v-card-title class="d-flex align-center ga-2 text-subtitle-1">
                  <v-icon icon="mdi-human-male-board" />
                  {{ selectedTeacherTitle || "教师任课明细" }}
                </v-card-title>
                <v-card-text>
                  <v-alert
                    v-if="!batchForm.accountId"
                    text="先选择一位教师，即可查看其当前任教的行政班与走班教学班。"
                    type="info"
                    variant="tonal"
                  />
                  <v-list
                    v-else-if="selectedTeacherAssignments.length"
                    class="assignment-list rounded-lg"
                    lines="two"
                  >
                    <template
                      v-for="(item, index) in selectedTeacherAssignments"
                      :key="item.assignment.id"
                    >
                      <v-list-item
                        :prepend-icon="item.workspace.type === 'ADMIN_CLASS' ? 'mdi-home-account' : 'mdi-account-switch'"
                        :subtitle="`${item.subject.name} · ${positionName(item.assignment.position)}`"
                        :title="item.workspace.name"
                      >
                        <template #append>
                          <v-btn
                            color="error"
                            icon="mdi-delete-outline"
                            :loading="removingAssignmentId === item.assignment.id"
                            size="small"
                            variant="text"
                            @click="removeAssignment(item.assignment, item.workspace.name)"
                          />
                        </template>
                      </v-list-item>
                      <v-divider v-if="index < selectedTeacherAssignments.length - 1" />
                    </template>
                  </v-list>
                  <v-empty-state
                    v-else
                    icon="mdi-account-school-outline"
                    text="可以从左侧按科目批量添加。"
                    title="这位教师暂无明确任课关系"
                  />
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-window-item>

        <v-window-item value="diagnostics">
          <v-alert
            v-if="!visibleDiagnostics.length && !loading"
            icon="mdi-check-circle-outline"
            text="当前年级没有发现授课结构或任课关系问题。"
            title="配置完整"
            type="success"
            variant="tonal"
          />
          <v-list
            v-else
            class="diagnostic-list rounded-lg"
            lines="two"
          >
            <template
              v-for="(item, index) in visibleDiagnostics"
              :key="`${item.code}-${index}`"
            >
              <v-list-item
                :prepend-icon="item.severity === 'ERROR' ? 'mdi-alert-circle-outline' : 'mdi-alert-outline'"
                :subtitle="diagnosticHint(item)"
                :title="item.message"
              >
                <template #append>
                  <v-chip
                    :color="item.severity === 'ERROR' ? 'error' : 'warning'"
                    size="small"
                    variant="tonal"
                  >
                    {{ item.severity === "ERROR" ? "结构冲突" : "待完善" }}
                  </v-chip>
                </template>
              </v-list-item>
              <v-divider v-if="index < visibleDiagnostics.length - 1" />
            </template>
          </v-list>
        </v-window-item>
      </v-window>
    </v-card-text>
  </v-card>

  <v-dialog
    v-model="assignmentDialog"
    max-width="640"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center ga-3 pa-5 pb-2">
        <v-icon
          color="primary"
          icon="mdi-human-male-board"
        />
        <div>
          <div>{{ editingTarget.workspaceName }}</div>
          <div class="text-body-2 text-medium-emphasis font-weight-regular">
            {{ editingTarget.subjectName }}任课教师
          </div>
        </div>
      </v-card-title>
      <v-card-text class="pa-5 pt-3">
        <v-alert
          v-if="errorMessage"
          class="mb-4"
          closable
          type="error"
          variant="tonal"
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>
        <div class="text-subtitle-2 mb-2">
          当前教师
        </div>
        <div
          v-if="editingTarget.assignments.length"
          class="d-flex flex-wrap ga-2 mb-5"
        >
          <v-chip
            v-for="assignment in editingTarget.assignments"
            :key="assignment.id"
            closable
            :color="assignment.position === 'PRIMARY' ? 'primary' : 'secondary'"
            :disabled="removingAssignmentId === assignment.id"
            variant="tonal"
            @click:close="removeAssignment(assignment, editingTarget.workspaceName)"
          >
            {{ accountName(assignment.account) }} · {{ positionName(assignment.position) }}
          </v-chip>
        </div>
        <v-alert
          v-else
          class="mb-5"
          text="尚未明确任课教师。"
          type="warning"
          variant="tonal"
        />
        <v-autocomplete
          v-model="singleForm.accountId"
          :items="teacherOptions"
          item-title="title"
          item-value="value"
          label="添加教师"
          variant="outlined"
        />
        <v-select
          v-model="singleForm.position"
          :items="positionOptions"
          item-title="title"
          item-value="value"
          label="任课身份"
          variant="outlined"
        />
      </v-card-text>
      <v-card-actions class="pa-5 pt-0">
        <v-spacer />
        <v-btn
          variant="text"
          @click="assignmentDialog = false"
        >
          关闭
        </v-btn>
        <v-btn
          color="primary"
          :disabled="!singleForm.accountId"
          :loading="savingAssignment"
          @click="saveSingleAssignment"
        >
          保存任课关系
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <AdminUndoSnackbar
    :busy="undoBusy"
    :offer="undoOffer"
    :remaining-seconds="remainingSeconds"
    @dismiss="clearUndo"
    @undo="undoLastRemoval"
  />
</template>

<script setup>
import {computed, onMounted, ref, watch} from "vue";
import AdminUndoSnackbar from "@/components/admin/AdminUndoSnackbar.vue";
import {useTimedUndo} from "@/composables/useTimedUndo";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";

const props = defineProps({
  schoolId: {type: String, required: true},
  termId: {type: String, required: true},
});

const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const overview = ref(null);
const selectedGradeId = ref("");
const section = ref("matrix");
const savingAssignment = ref(false);
const removingAssignmentId = ref("");
const assignmentDialog = ref(false);
const editingTarget = ref({workspaceId: "", workspaceName: "", subjectId: "", subjectName: "", assignments: []});
const singleForm = ref({accountId: "", position: "PRIMARY"});
const batchForm = ref({accountId: "", subjectId: "", workspaceIds: [], position: "PRIMARY"});
const {undoOffer, undoBusy, remainingSeconds, offerUndo, executeUndo, clearUndo} = useTimedUndo();

const positionOptions = [
  {title: "主讲教师", value: "PRIMARY"},
  {title: "协同教师", value: "CO_TEACHER"},
];

const gradeOptions = computed(() => (overview.value?.grades || []).map((grade) => ({
  title: grade.name,
  value: grade.id,
})));
const visibleAdministrativeClasses = computed(() => (overview.value?.administrativeClasses || [])
  .filter((item) => item.isActive !== false && (!selectedGradeId.value || item.gradeId === selectedGradeId.value)));
const visibleCourseGroups = computed(() => (overview.value?.courseGroups || [])
  .filter((item) => item.isActive !== false && (!selectedGradeId.value || item.gradeId === selectedGradeId.value)));
const visibleDiagnostics = computed(() => (overview.value?.diagnostics || [])
  .filter((item) => !selectedGradeId.value || item.gradeId === selectedGradeId.value));
const visibleSubjects = computed(() => (overview.value?.subjects || []).filter((subject) =>
  visibleAdministrativeClasses.value.some((administrativeClass) =>
    administrativeClass.subjectRules.some((rule) => rule.subjectId === subject.id))));
const teacherOptions = computed(() => (overview.value?.teacherAccounts || []).map((account) => ({
  title: `${accountName(account)}${account.localDisabled ? "（已停用）" : ""}`,
  value: account.id,
  props: {disabled: account.localDisabled},
})));
const subjectOptions = computed(() => visibleSubjects.value.map((subject) => ({title: subject.name, value: subject.id})));
const eligibleWorkspaceOptions = computed(() => {
  if (!batchForm.value.subjectId) return [];
  const administrativeClasses = visibleAdministrativeClasses.value
    .filter((item) => subjectRule(item, batchForm.value.subjectId)?.deliveryMode === "ADMIN_CLASS")
    .map((item) => ({title: `${item.name} · 随行政班`, value: item.id}));
  const courseGroups = visibleCourseGroups.value
    .filter((item) => item.subjectId === batchForm.value.subjectId)
    .map((item) => ({title: `${item.name} · 走班教学班`, value: item.id}));
  return [...administrativeClasses, ...courseGroups];
});
const batchCanSave = computed(() => batchForm.value.accountId && batchForm.value.subjectId &&
  batchForm.value.workspaceIds.length > 0);
const selectedTeacherTitle = computed(() => accountName((overview.value?.teacherAccounts || [])
  .find((item) => item.id === batchForm.value.accountId)));
const selectedTeacherAssignments = computed(() => {
  if (!batchForm.value.accountId) return [];
  const workspaces = [...visibleAdministrativeClasses.value, ...visibleCourseGroups.value];
  return workspaces.flatMap((workspace) => workspace.assignments
    .filter((assignment) => assignment.accountId === batchForm.value.accountId)
    .map((assignment) => ({
      assignment,
      workspace,
      subject: (overview.value?.subjects || []).find((subject) => subject.id === assignment.subjectId) ||
        {id: assignment.subjectId, name: "未知科目"},
    })))
    .sort((left, right) => (left.subject.sortOrder || 0) - (right.subject.sortOrder || 0) ||
      left.workspace.code.localeCompare(right.workspace.code));
});

const summaryItems = computed(() => {
  const summary = overview.value?.summary || {};
  return [
    {label: "行政班", value: summary.administrativeClasses || 0, icon: "mdi-home-group", color: "primary"},
    {label: "走班教学班", value: summary.courseGroups || 0, icon: "mdi-account-switch", color: "secondary"},
    {label: "明确任课", value: summary.teachingAssignments || 0, icon: "mdi-human-male-board", color: "success"},
    {label: "结构冲突", value: summary.errors || 0, icon: "mdi-alert-circle", color: "error"},
    {label: "待完善", value: summary.warnings || 0, icon: "mdi-alert", color: "warning"},
  ];
});

function subjectRule(administrativeClass, subjectId) {
  return administrativeClass.subjectRules.find((rule) => rule.subjectId === subjectId);
}

function coveringGroups(administrativeClassId, subjectId) {
  return visibleCourseGroups.value.filter((group) => group.subjectId === subjectId &&
    group.sourceClasses.some((source) => source.administrativeClassId === administrativeClassId));
}

function assignmentNames(assignments = []) {
  if (!assignments.length) return "未明确教师";
  return assignments.map((item) => {
    const name = item.account?.name || item.account?.localUsername || item.account?.email || "未命名教师";
    return item.position === "CO_TEACHER" ? `${name}（协同）` : name;
  }).join("、");
}

function accountName(account) {
  return account?.name || account?.localUsername || account?.email || "";
}

function positionName(position) {
  return position === "CO_TEACHER" ? "协同教师" : "主讲教师";
}

function openAdministrativeClassAssignment(administrativeClass, subject) {
  const rule = subjectRule(administrativeClass, subject.id);
  openAssignmentDialog(administrativeClass, subject, rule?.assignments || []);
}

function openCourseGroupAssignment(group) {
  openAssignmentDialog(group, group.subject, group.assignments || []);
}

function openAssignmentDialog(workspace, subject, assignments) {
  editingTarget.value = {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    subjectId: subject.id,
    subjectName: subject.name,
    assignments,
  };
  singleForm.value = {accountId: "", position: "PRIMARY"};
  assignmentDialog.value = true;
}

async function saveSingleAssignment() {
  if (!singleForm.value.accountId) return;
  savingAssignment.value = true;
  errorMessage.value = "";
  try {
    await classworksV2Api.saveTeachingAssignment(props.schoolId, {
      workspaceId: editingTarget.value.workspaceId,
      subjectId: editingTarget.value.subjectId,
      accountId: singleForm.value.accountId,
      position: singleForm.value.position,
    });
    successMessage.value = `${editingTarget.value.workspaceName}的${editingTarget.value.subjectName}任课关系已保存。`;
    assignmentDialog.value = false;
    await loadOverview({preserveMessages: true});
  } catch (error) {
    errorMessage.value = describeApiError(error, "保存任课关系失败");
  } finally {
    savingAssignment.value = false;
  }
}

async function saveBatchAssignments() {
  if (!batchCanSave.value) return;
  savingAssignment.value = true;
  errorMessage.value = "";
  try {
    const result = await classworksV2Api.saveTeachingAssignmentsBulk(props.schoolId, batchForm.value);
    successMessage.value = `已为${selectedTeacherTitle.value}添加 ${result.count} 项任课关系。`;
    batchForm.value.workspaceIds = [];
    await loadOverview({preserveMessages: true});
  } catch (error) {
    errorMessage.value = describeApiError(error, "批量保存任课关系失败");
  } finally {
    savingAssignment.value = false;
  }
}

async function removeAssignment(assignment, workspaceName) {
  const teacherName = accountName(assignment.account);
  if (!window.confirm(`移除${teacherName}在${workspaceName}的任课关系？`)) return;
  removingAssignmentId.value = assignment.id;
  errorMessage.value = "";
  const restoreInput = {
    workspaceId: assignment.workspaceId,
    subjectId: assignment.subjectId,
    accountId: assignment.accountId,
    position: assignment.position,
  };
  try {
    await classworksV2Api.removeTeachingAssignment(props.schoolId, assignment.id);
    successMessage.value = `已移除${teacherName}在${workspaceName}的任课关系，可在下方短时撤销。`;
    assignmentDialog.value = false;
    await loadOverview({preserveMessages: true});
    offerUndo({
      message: `已移除${teacherName}在${workspaceName}的任课关系`,
      undo: async () => {
        await classworksV2Api.saveTeachingAssignment(props.schoolId, restoreInput);
        successMessage.value = `已恢复${teacherName}在${workspaceName}的任课关系。`;
        await loadOverview({preserveMessages: true});
      },
    });
  } catch (error) {
    errorMessage.value = describeApiError(error, "移除任课关系失败");
  } finally {
    removingAssignmentId.value = "";
  }
}

async function undoLastRemoval() {
  errorMessage.value = "";
  try {
    await executeUndo();
  } catch (error) {
    clearUndo();
    errorMessage.value = describeApiError(error, "撤销移除任课关系失败，数据可能已被其他管理员修改");
  }
}

function diagnosticHint(item) {
  const administrativeClass = (overview.value?.administrativeClasses || [])
    .find((candidate) => candidate.id === item.administrativeClassId);
  const workspace = [...(overview.value?.administrativeClasses || []), ...(overview.value?.courseGroups || [])]
    .find((candidate) => candidate.id === item.workspaceId);
  const subject = (overview.value?.subjects || []).find((candidate) => candidate.id === item.subjectId);
  return [administrativeClass?.name || workspace?.name, subject?.name].filter(Boolean).join(" · ") || "教学关系诊断";
}

async function loadOverview(options = {}) {
  if (!props.schoolId || !props.termId) return;
  loading.value = true;
  errorMessage.value = "";
  if (!options.preserveMessages) successMessage.value = "";
  try {
    overview.value = await classworksV2Api.teachingRelationships(props.schoolId, props.termId);
    if (!gradeOptions.value.some((item) => item.value === selectedGradeId.value)) {
      selectedGradeId.value = gradeOptions.value[0]?.value || "";
    }
  } catch (error) {
    errorMessage.value = describeApiError(error, "读取教学关系失败");
  } finally {
    loading.value = false;
  }
}

watch(() => [props.schoolId, props.termId], loadOverview);
watch(() => batchForm.value.subjectId, () => {
  batchForm.value.workspaceIds = [];
});
watch(selectedGradeId, () => {
  batchForm.value.workspaceIds = [];
});
onMounted(loadOverview);
</script>

<style scoped>
.summary-tile {
  align-items: center;
  background: rgba(var(--v-theme-surface-variant), 0.42);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 14px;
  display: flex;
  gap: 12px;
  min-height: 74px;
  padding: 12px 14px;
}

.grade-select {
  flex: 0 1 280px;
}

.matrix-scroll {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 14px;
  max-height: 62vh;
  overflow: auto;
}

.relationship-matrix {
  border-collapse: separate;
  border-spacing: 0;
  min-width: 100%;
}

.relationship-matrix th,
.relationship-matrix td {
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  min-width: 172px;
  padding: 12px;
  text-align: left;
  vertical-align: top;
}

.relationship-matrix thead th {
  background: rgb(var(--v-theme-surface-variant));
  position: sticky;
  top: 0;
  z-index: 2;
}

.relationship-matrix .class-column {
  left: 0;
  min-width: 150px;
  position: sticky;
  z-index: 1;
}

.relationship-matrix thead .class-column {
  z-index: 3;
}

.relationship-matrix tr:last-child th,
.relationship-matrix tr:last-child td {
  border-bottom: 0;
}

.teacher-line,
.group-list,
.not-offered {
  font-size: 0.78rem;
  line-height: 1.45;
  margin-top: 7px;
}

.group-list {
  display: grid;
  gap: 5px;
}

.cell-editor,
.group-editor {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
  width: 100%;
}

.cell-editor {
  border-radius: 8px;
  display: block;
  margin: -6px;
  padding: 6px;
}

.cell-editor:hover,
.group-editor:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.group-editor {
  align-items: center;
  border-radius: 6px;
  display: flex;
  padding: 4px;
}

.not-offered {
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.5);
  display: flex;
  gap: 4px;
}

.diagnostic-list {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.assignment-list {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

@media (max-width: 700px) {
  .relationship-overview :deep(.v-card-title) {
    align-items: flex-start !important;
  }

  .grade-select {
    flex-basis: 100%;
  }

  .matrix-scroll {
    max-height: none;
    overscroll-behavior-x: contain;
    touch-action: pan-x pan-y;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
