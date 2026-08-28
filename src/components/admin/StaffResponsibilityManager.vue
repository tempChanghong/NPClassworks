<template>
  <v-card class="mb-5 rounded-xl">
    <v-card-title class="d-flex flex-wrap align-center ga-3 pa-5 pb-2">
      <v-icon
        color="primary"
        icon="mdi-account-supervisor-circle-outline"
      />
      <div>
        <div>人员与职责</div>
        <div class="text-body-2 text-medium-emphasis font-weight-regular">
          年级组长、班主任和任课关系分别记录，最终权限按职责叠加
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

      <v-row class="mb-2">
        <v-col
          v-for="item in summaryItems"
          :key="item.label"
          cols="6"
          lg="2"
          sm="4"
        >
          <div class="staff-summary-tile">
            <v-icon
              :color="item.color"
              :icon="item.icon"
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

      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          color="primary"
          prepend-icon="mdi-account-tie-hat-outline"
          variant="tonal"
          @click="openGradeDialog()"
        >
          设置年级组长
        </v-btn>
        <v-btn
          color="secondary"
          prepend-icon="mdi-home-account"
          variant="tonal"
          @click="openClassDialog()"
        >
          设置班主任
        </v-btn>
        <v-chip
          color="info"
          prepend-icon="mdi-information-outline"
          variant="tonal"
        >
          任课教师在上方“年级教学关系总览”中设置
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
        class="mb-4"
        color="primary"
      >
        <v-tab value="organization">
          组织视角
        </v-tab>
        <v-tab value="people">
          人员视角
        </v-tab>
        <v-tab value="diagnostics">
          岗位诊断
          <v-badge
            v-if="overview?.diagnostics?.length"
            class="ml-3"
            color="warning"
            :content="overview.diagnostics.length"
            inline
          />
        </v-tab>
        <v-tab value="policy">
          联动规则
        </v-tab>
      </v-tabs>

      <v-window v-model="section">
        <v-window-item value="organization">
          <v-expansion-panels
            v-if="overview?.grades?.length"
            variant="accordion"
          >
            <v-expansion-panel
              v-for="grade in overview.grades"
              :key="grade.id"
            >
              <v-expansion-panel-title>
                <div class="d-flex flex-wrap align-center ga-2">
                  <strong>{{ grade.name }}</strong>
                  <v-chip
                    v-for="leadership in grade.leaderships"
                    :key="leadership.id"
                    closable
                    color="primary"
                    size="small"
                    variant="tonal"
                    @click.stop
                    @click:close="removeGradeRole(leadership, grade.name)"
                  >
                    {{ accountName(leadership.account) }} · {{ gradePositionName(leadership.position) }}
                  </v-chip>
                  <v-chip
                    v-if="!grade.leaderships.length"
                    color="warning"
                    size="small"
                    variant="tonal"
                  >
                    未设置年级组长
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-list
                  class="rounded-lg"
                  lines="two"
                >
                  <template
                    v-for="administrativeClass in classesForGrade(grade.id)"
                    :key="administrativeClass.id"
                  >
                    <v-list-item
                      prepend-icon="mdi-home-outline"
                      :subtitle="`${teachingCountForClass(administrativeClass.id)} 项明确随班任课关系`"
                      :title="administrativeClass.name"
                    >
                      <template #append>
                        <div class="d-flex flex-wrap justify-end ga-2">
                          <v-chip
                            v-for="leadership in administrativeClass.leaderships"
                            :key="leadership.id"
                            closable
                            color="secondary"
                            size="small"
                            variant="tonal"
                            @click:close="removeClassRole(leadership, administrativeClass.name)"
                          >
                            {{ accountName(leadership.account) }} · {{ classPositionName(leadership.position) }}
                          </v-chip>
                          <v-btn
                            icon="mdi-account-plus-outline"
                            size="small"
                            title="设置班主任"
                            variant="text"
                            @click="openClassDialog(administrativeClass)"
                          />
                        </div>
                      </template>
                    </v-list-item>
                    <v-divider />
                  </template>
                </v-list>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
          <v-empty-state
            v-else-if="!loading"
            icon="mdi-account-group-outline"
            text="请先完成学校组织与班级初始化。"
            title="暂无年级"
          />
        </v-window-item>

        <v-window-item value="people">
          <v-text-field
            v-model.trim="peopleSearch"
            class="mb-3"
            clearable
            hide-details
            label="搜索教师姓名或账号"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
          />
          <v-row>
            <v-col
              v-for="person in filteredPeople"
              :key="person.account.id"
              cols="12"
              lg="4"
              md="6"
            >
              <v-card
                class="person-card h-100 rounded-lg"
                variant="outlined"
              >
                <v-card-title class="d-flex align-center ga-3 text-subtitle-1">
                  <v-avatar
                    color="primary"
                    size="36"
                    variant="tonal"
                  >
                    {{ accountName(person.account).slice(0, 1) }}
                  </v-avatar>
                  <div>
                    <div>{{ accountName(person.account) }}</div>
                    <div class="text-caption text-medium-emphasis font-weight-regular">
                      {{ person.account.localUsername || person.account.email || "学校账号" }}
                    </div>
                  </div>
                  <v-spacer />
                  <v-chip
                    v-if="person.account.localDisabled"
                    color="error"
                    size="small"
                  >
                    已停用
                  </v-chip>
                </v-card-title>
                <v-card-text>
                  <div class="d-flex flex-wrap ga-2 mb-3">
                    <v-chip
                      v-for="role in person.gradeLeaderships"
                      :key="role.id"
                      color="primary"
                      size="small"
                      variant="tonal"
                    >
                      {{ role.grade.name }}{{ gradePositionName(role.position) }}
                    </v-chip>
                    <v-chip
                      v-for="role in person.classLeaderships"
                      :key="role.id"
                      color="secondary"
                      size="small"
                      variant="tonal"
                    >
                      {{ role.administrativeClass.name }}{{ classPositionName(role.position) }}
                    </v-chip>
                    <v-chip
                      v-if="person.teachingAssignments.length"
                      color="success"
                      size="small"
                      variant="tonal"
                    >
                      任课 {{ person.teachingAssignments.length }} 项
                    </v-chip>
                    <span
                      v-if="!person.gradeLeaderships.length && !person.classLeaderships.length && !person.teachingAssignments.length"
                      class="text-caption text-medium-emphasis"
                    >尚未分配教学职责</span>
                  </div>
                  <v-divider class="mb-3" />
                  <div class="text-caption text-medium-emphasis mb-1">
                    有效权限
                  </div>
                  <ul class="permission-list text-body-2">
                    <li
                      v-for="line in permissionPreview(person)"
                      :key="line"
                    >
                      {{ line }}
                    </li>
                  </ul>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-window-item>

        <v-window-item value="diagnostics">
          <v-alert
            v-if="!overview?.diagnostics?.length && !loading"
            text="年级组长、班主任和任课关系符合当前学校规则。"
            title="岗位配置完整"
            type="success"
            variant="tonal"
          />
          <v-list
            v-else
            class="diagnostic-list rounded-lg"
            lines="two"
          >
            <template
              v-for="(item, index) in overview?.diagnostics || []"
              :key="`${item.code}-${index}`"
            >
              <v-list-item
                :prepend-icon="item.severity === 'ERROR' ? 'mdi-alert-circle-outline' : 'mdi-alert-outline'"
                :subtitle="diagnosticScope(item)"
                :title="item.message"
              >
                <template #append>
                  <v-chip
                    :color="item.severity === 'ERROR' ? 'error' : 'warning'"
                    size="small"
                    variant="tonal"
                  >
                    {{ item.severity === "ERROR" ? "冲突" : "待完善" }}
                  </v-chip>
                </template>
              </v-list-item>
              <v-divider v-if="index < overview.diagnostics.length - 1" />
            </template>
          </v-list>
        </v-window-item>

        <v-window-item value="policy">
          <v-card
            class="rounded-lg"
            variant="tonal"
          >
            <v-card-text>
              <v-switch
                v-model="policyForm.gradeLeaderMustBeHomeroom"
                color="primary"
                label="年级组长必须同时担任本年级班主任"
              />
              <v-switch
                v-model="policyForm.gradeLeaderMustTeach"
                color="primary"
                label="年级组长必须至少有一项本年级任课关系"
              />
              <v-switch
                v-model="policyForm.homeroomMustTeach"
                color="primary"
                label="班主任必须至少有一项本年级任课关系"
              />
              <v-alert
                class="mb-4"
                type="info"
                variant="tonal"
              >
                这些规则用于诊断和提醒，不会把年级组长自动伪装成全年级任课教师，也不会阻止临时缺岗配置。
              </v-alert>
              <v-btn
                color="primary"
                :loading="saving"
                prepend-icon="mdi-content-save-outline"
                @click="savePolicy"
              >
                保存联动规则
              </v-btn>
            </v-card-text>
          </v-card>
        </v-window-item>
      </v-window>
    </v-card-text>
  </v-card>

  <v-dialog
    v-model="gradeDialog"
    max-width="560"
  >
    <v-card class="rounded-xl">
      <v-card-title class="pa-5 pb-2">
        设置年级组长
      </v-card-title>
      <v-card-text class="pa-5 pt-3">
        <v-autocomplete
          v-model="gradeForm.accountId"
          :items="teacherOptions"
          item-title="title"
          item-value="value"
          label="教师"
          variant="outlined"
        />
        <v-select
          v-model="gradeForm.gradeId"
          :items="gradeOptions"
          item-title="title"
          item-value="value"
          label="负责年级"
          variant="outlined"
        />
        <v-select
          v-model="gradeForm.position"
          :items="gradePositionOptions"
          item-title="title"
          item-value="value"
          label="岗位"
          variant="outlined"
        />
      </v-card-text>
      <v-card-actions class="pa-5 pt-0">
        <v-spacer />
        <v-btn
          variant="text"
          @click="gradeDialog = false"
        >
          取消
        </v-btn>
        <v-btn
          color="primary"
          :disabled="!gradeForm.accountId || !gradeForm.gradeId"
          :loading="saving"
          @click="saveGradeRole"
        >
          保存
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog
    v-model="classDialog"
    max-width="560"
  >
    <v-card class="rounded-xl">
      <v-card-title class="pa-5 pb-2">
        设置班主任
      </v-card-title>
      <v-card-text class="pa-5 pt-3">
        <v-autocomplete
          v-model="classForm.accountId"
          :items="teacherOptions"
          item-title="title"
          item-value="value"
          label="教师"
          variant="outlined"
        />
        <v-select
          v-model="classForm.administrativeClassId"
          :items="classOptions"
          item-title="title"
          item-value="value"
          label="行政班"
          variant="outlined"
        />
        <v-select
          v-model="classForm.position"
          :items="classPositionOptions"
          item-title="title"
          item-value="value"
          label="岗位"
          variant="outlined"
        />
      </v-card-text>
      <v-card-actions class="pa-5 pt-0">
        <v-spacer />
        <v-btn
          variant="text"
          @click="classDialog = false"
        >
          取消
        </v-btn>
        <v-btn
          color="primary"
          :disabled="!classForm.accountId || !classForm.administrativeClassId"
          :loading="saving"
          @click="saveClassRole"
        >
          保存
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
const saving = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const overview = ref(null);
const section = ref("organization");
const peopleSearch = ref("");
const gradeDialog = ref(false);
const classDialog = ref(false);
const gradeForm = ref({accountId: "", gradeId: "", position: "PRIMARY"});
const classForm = ref({accountId: "", administrativeClassId: "", position: "HEAD_TEACHER"});
const policyForm = ref({gradeLeaderMustBeHomeroom: true, gradeLeaderMustTeach: true, homeroomMustTeach: true});
const {undoOffer, undoBusy, remainingSeconds, offerUndo, executeUndo, clearUndo} = useTimedUndo();

const gradePositionOptions = [
  {title: "主要年级组长", value: "PRIMARY"},
  {title: "副年级组长", value: "DEPUTY"},
];
const classPositionOptions = [
  {title: "班主任", value: "HEAD_TEACHER"},
  {title: "协同班主任", value: "CO_HEAD_TEACHER"},
];

const summaryItems = computed(() => {
  const summary = overview.value?.summary || {};
  return [
    {label: "人员", value: summary.people || 0, icon: "mdi-account-group", color: "primary"},
    {label: "年级职责", value: summary.gradeLeaderships || 0, icon: "mdi-account-tie-hat", color: "primary"},
    {label: "班主任职责", value: summary.classLeaderships || 0, icon: "mdi-home-account", color: "secondary"},
    {label: "任课关系", value: summary.teachingAssignments || 0, icon: "mdi-human-male-board", color: "success"},
    {label: "待处理", value: (summary.errors || 0) + (summary.warnings || 0), icon: "mdi-alert", color: "warning"},
  ];
});
const teacherOptions = computed(() => (overview.value?.teacherAccounts || []).map((account) => ({
  title: `${accountName(account)}${account.localUsername ? ` · ${account.localUsername}` : ""}${account.localDisabled ? "（已停用）" : ""}`,
  value: account.id,
  props: {disabled: account.localDisabled},
})));
const gradeOptions = computed(() => (overview.value?.grades || []).map((grade) => ({title: grade.name, value: grade.id})));
const classOptions = computed(() => (overview.value?.administrativeClasses || []).map((item) => ({
  title: `${item.name} · ${item.code}`,
  value: item.id,
})));
const filteredPeople = computed(() => {
  const keyword = peopleSearch.value.toLowerCase();
  return (overview.value?.people || []).filter((person) => !keyword ||
    [person.account.name, person.account.localUsername, person.account.email]
      .filter(Boolean).some((item) => item.toLowerCase().includes(keyword)));
});

function accountName(account) {
  return account?.name || account?.localUsername || account?.email || "未命名教师";
}

function gradePositionName(position) {
  return position === "DEPUTY" ? "副组长" : "年级组长";
}

function classPositionName(position) {
  return position === "CO_HEAD_TEACHER" ? "协同班主任" : "班主任";
}

function classesForGrade(gradeId) {
  return (overview.value?.administrativeClasses || []).filter((item) => item.gradeId === gradeId);
}

function teachingCountForClass(classId) {
  return (overview.value?.teachingAssignments || []).filter((item) => item.workspaceId === classId).length;
}

function permissionPreview(person) {
  const lines = [];
  for (const role of person.gradeLeaderships) {
    lines.push(`管理${role.grade.name}全部作业、通知与认证；可查看本年级教学空间`);
  }
  for (const role of person.classLeaderships) {
    lines.push(`管理${role.administrativeClass.name}；只读查看与本班相关的走班作业`);
  }
  if (person.teachingAssignments.length) {
    lines.push(`在 ${person.teachingAssignments.length} 个明确任课单元发布和确认作业`);
  }
  return lines.length ? lines : ["当前只有登录身份，尚无教学业务权限"];
}

function diagnosticScope(item) {
  const grade = (overview.value?.grades || []).find((candidate) => candidate.id === item.gradeId);
  const administrativeClass = (overview.value?.administrativeClasses || [])
    .find((candidate) => candidate.id === item.administrativeClassId);
  return [grade?.name, administrativeClass?.name].filter(Boolean).join(" · ") || "人员职责";
}

function openGradeDialog() {
  gradeForm.value = {accountId: "", gradeId: overview.value?.grades?.[0]?.id || "", position: "PRIMARY"};
  gradeDialog.value = true;
}

function openClassDialog(administrativeClass = null) {
  classForm.value = {
    accountId: "",
    administrativeClassId: administrativeClass?.id || overview.value?.administrativeClasses?.[0]?.id || "",
    position: "HEAD_TEACHER",
  };
  classDialog.value = true;
}

async function runMutation(action, success) {
  saving.value = true;
  errorMessage.value = "";
  try {
    await action();
    successMessage.value = success;
    await loadOverview({preserveMessages: true});
    return true;
  } catch (error) {
    errorMessage.value = describeApiError(error, "保存人员职责失败");
    return false;
  } finally {
    saving.value = false;
  }
}

async function saveGradeRole() {
  if (await runMutation(
    () => classworksV2Api.saveGradeLeadership(props.schoolId, gradeForm.value),
    "年级职责已保存。",
  )) gradeDialog.value = false;
}

async function saveClassRole() {
  if (await runMutation(
    () => classworksV2Api.saveClassLeadership(props.schoolId, classForm.value),
    "班主任职责已保存。",
  )) classDialog.value = false;
}

async function removeGradeRole(leadership, gradeName) {
  if (!window.confirm(`移除${accountName(leadership.account)}在${gradeName}的${gradePositionName(leadership.position)}职责？`)) return;
  const teacherName = accountName(leadership.account);
  const removed = await runMutation(
    () => classworksV2Api.removeGradeLeadership(props.schoolId, leadership.id),
    "年级职责已移除，可在下方短时撤销。",
  );
  if (removed) offerUndo({
    message: `已移除${teacherName}在${gradeName}的${gradePositionName(leadership.position)}职责`,
    undo: async () => {
      await classworksV2Api.saveGradeLeadership(props.schoolId, {
        accountId: leadership.accountId,
        gradeId: leadership.gradeId,
        position: leadership.position,
      });
      successMessage.value = "年级职责已恢复。";
      await loadOverview({preserveMessages: true});
    },
  });
}

async function removeClassRole(leadership, className) {
  if (!window.confirm(`移除${accountName(leadership.account)}在${className}的${classPositionName(leadership.position)}职责？`)) return;
  const teacherName = accountName(leadership.account);
  const removed = await runMutation(
    () => classworksV2Api.removeClassLeadership(props.schoolId, leadership.id),
    "班主任职责已移除，可在下方短时撤销。",
  );
  if (removed) offerUndo({
    message: `已移除${teacherName}在${className}的${classPositionName(leadership.position)}职责`,
    undo: async () => {
      await classworksV2Api.saveClassLeadership(props.schoolId, {
        accountId: leadership.accountId,
        administrativeClassId: leadership.administrativeClassId,
        position: leadership.position,
      });
      successMessage.value = "班主任职责已恢复。";
      await loadOverview({preserveMessages: true});
    },
  });
}

async function undoLastRemoval() {
  errorMessage.value = "";
  try {
    await executeUndo();
  } catch (error) {
    clearUndo();
    errorMessage.value = describeApiError(error, "撤销职责移除失败，数据可能已被其他管理员修改");
  }
}

async function savePolicy() {
  await runMutation(
    () => classworksV2Api.updateStaffResponsibilityPolicy(props.schoolId, policyForm.value),
    "岗位联动规则已保存。",
  );
}

async function loadOverview(options = {}) {
  if (!props.schoolId || !props.termId) return;
  loading.value = true;
  errorMessage.value = "";
  if (!options.preserveMessages) successMessage.value = "";
  try {
    overview.value = await classworksV2Api.staffResponsibilities(props.schoolId, props.termId);
    policyForm.value = {
      gradeLeaderMustBeHomeroom: overview.value.school.gradeLeaderMustBeHomeroom,
      gradeLeaderMustTeach: overview.value.school.gradeLeaderMustTeach,
      homeroomMustTeach: overview.value.school.homeroomMustTeach,
    };
  } catch (error) {
    errorMessage.value = describeApiError(error, "读取人员职责失败");
  } finally {
    loading.value = false;
  }
}

watch(() => [props.schoolId, props.termId], loadOverview);
onMounted(loadOverview);
</script>

<style scoped>
.staff-summary-tile {
  align-items: center;
  background: rgba(var(--v-theme-surface-variant), 0.42);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 14px;
  display: flex;
  gap: 12px;
  min-height: 72px;
  padding: 12px 14px;
}

.person-card {
  min-height: 210px;
}

.permission-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
}

.diagnostic-list {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
