<template>
  <div>
    <v-progress-linear
      v-if="loading"
      class="mb-4"
      indeterminate
      rounded
    />
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

    <v-tabs
      v-model="section"
      class="mb-4"
      color="primary"
    >
      <v-tab value="classes">
        行政班授课规则
      </v-tab>
      <v-tab value="groups">
        走班教学班与来源
      </v-tab>
    </v-tabs>

    <v-window v-model="section">
      <v-window-item value="classes">
        <v-row>
          <v-col
            cols="12"
            lg="4"
          >
            <v-card class="rounded-xl">
              <v-card-title class="pa-5 pb-2">
                选择行政班
              </v-card-title>
              <v-card-text class="px-5 pb-5">
                <v-select
                  v-model="selectedClassId"
                  :items="administrativeClassOptions"
                  item-title="title"
                  item-value="value"
                  label="行政班"
                  variant="outlined"
                />
                <v-select
                  v-model="preset"
                  :items="presetOptions"
                  item-title="title"
                  item-value="value"
                  label="快速预设"
                  variant="outlined"
                />
                <v-select
                  v-if="['single-fixed', 'triple-fixed'].includes(preset)"
                  v-model="presetFixedSubjectIds"
                  :items="electiveSubjectOptions"
                  chips
                  closable-chips
                  item-title="title"
                  item-value="value"
                  label="定班选科"
                  multiple
                  variant="outlined"
                />
                <v-btn
                  block
                  :disabled="preset === 'custom'"
                  prepend-icon="mdi-auto-fix"
                  variant="tonal"
                  @click="applyPreset"
                >
                  应用预设
                </v-btn>
                <v-alert
                  class="mt-4"
                  type="info"
                  variant="tonal"
                >
                  预设只是快速填充。应用后仍可逐科修改，不会把“一班、二班”写成固定类型。
                </v-alert>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col
            cols="12"
            lg="8"
          >
            <v-card class="rounded-xl">
              <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5 pb-2">
                {{ selectedAdministrativeClass?.name || "行政班授课规则" }}
                <v-spacer />
                <v-btn
                  :loading="loading"
                  prepend-icon="mdi-content-save-outline"
                  color="primary"
                  @click="saveSubjectRules(false)"
                >
                  保存规则
                </v-btn>
              </v-card-title>
              <v-card-text class="px-5 pb-5">
                <v-alert
                  v-if="conflictingCourseGroups.length"
                  class="mb-4"
                  type="warning"
                  variant="tonal"
                >
                  <div class="font-weight-bold mb-1">
                    新规则与现有走班来源冲突
                  </div>
                  <div class="mb-3">
                    {{ conflictingCourseGroups.map((item) => item.name).join("、") }} 仍将本班列为来源。
                  </div>
                  <v-btn
                    color="warning"
                    prepend-icon="mdi-link-off"
                    size="small"
                    variant="flat"
                    @click="saveSubjectRules(true)"
                  >
                    解除这些来源关系并保存
                  </v-btn>
                </v-alert>

                <div class="subject-rule-grid">
                  <v-card
                    v-for="subject in structure?.subjects || []"
                    :key="subject.id"
                    class="subject-rule-card"
                    variant="outlined"
                  >
                    <v-card-text class="pa-4">
                      <div class="d-flex align-center ga-2 mb-3">
                        <v-avatar
                          color="primary"
                          size="32"
                          variant="tonal"
                        >
                          {{ subject.name.slice(0, 1) }}
                        </v-avatar>
                        <div>
                          <div class="font-weight-bold">
                            {{ subject.name }}
                          </div>
                          <div class="text-caption text-medium-emphasis">
                            {{ subjectCategoryLabel(subject.category) }}
                          </div>
                        </div>
                      </div>
                      <v-select
                        v-model="ruleModes[subject.id]"
                        :items="deliveryModeOptions"
                        density="compact"
                        hide-details
                        item-title="title"
                        item-value="value"
                        label="授课方式"
                        variant="outlined"
                        @update:model-value="preset = 'custom'"
                      />
                    </v-card-text>
                  </v-card>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <v-window-item value="groups">
        <v-card class="rounded-xl">
          <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5">
            走班教学班
            <v-spacer />
            <v-btn
              color="primary"
              prepend-icon="mdi-account-group-outline"
              @click="openCourseGroupDialog()"
            >
              新建教学班
            </v-btn>
          </v-card-title>
          <v-card-text class="px-5 pb-5">
            <v-alert
              class="mb-4"
              type="info"
              variant="tonal"
            >
              一个行政班可以同时作为多个同科教学班的来源，例如三班学生可以分别进入物理A1和物理A2。
            </v-alert>
            <v-expansion-panels
              multiple
              variant="accordion"
            >
              <v-expansion-panel
                v-for="group in sortedCourseGroups"
                :key="group.id"
              >
                <v-expansion-panel-title>
                  <div class="d-flex align-center flex-wrap ga-2 flex-grow-1">
                    <span class="font-weight-bold">{{ group.name }}</span>
                    <v-chip
                      size="small"
                      variant="tonal"
                    >
                      {{ group.subject?.name }}
                    </v-chip>
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      {{ group.code }}
                    </v-chip>
                    <v-chip
                      :color="group.isActive ? 'success' : 'grey'"
                      size="small"
                      variant="tonal"
                    >
                      {{ group.isActive ? "启用" : "停用" }}
                    </v-chip>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="text-subtitle-2 mb-2">
                    来源行政班
                  </div>
                  <div class="d-flex flex-wrap ga-2 mb-4">
                    <v-chip
                      v-for="source in group.sourceClasses"
                      :key="source.administrativeClassId"
                      prepend-icon="mdi-account-multiple-outline"
                      variant="tonal"
                    >
                      {{ source.administrativeClass.name }}
                    </v-chip>
                    <span
                      v-if="!group.sourceClasses.length"
                      class="text-medium-emphasis"
                    >
                      尚未配置
                    </span>
                  </div>
                  <div class="d-flex align-center flex-wrap ga-2">
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      {{ group.isStudentSelectable ? "学生可选择" : "仅后台分配" }}
                    </v-chip>
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      {{ group._count?.members || 0 }} 位教师
                    </v-chip>
                    <v-chip
                      size="small"
                      variant="outlined"
                    >
                      {{ group._count?.publicationTargets || 0 }} 条历史内容
                    </v-chip>
                    <v-spacer />
                    <v-btn
                      prepend-icon="mdi-pencil-outline"
                      size="small"
                      variant="tonal"
                      @click="openCourseGroupDialog(group)"
                    >
                      编辑
                    </v-btn>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
            <v-empty-state
              v-if="!sortedCourseGroups.length && !loading"
              icon="mdi-account-group-outline"
              text="当前学期没有走班教学班"
            />
          </v-card-text>
        </v-card>
      </v-window-item>
    </v-window>

    <v-dialog
      v-model="courseGroupDialog"
      max-width="680"
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          {{ editingCourseGroupId ? "编辑走班教学班" : "新建走班教学班" }}
        </v-card-title>
        <v-card-text class="px-5">
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <v-text-field
                v-model.trim="courseGroupForm.name"
                label="教学班名称"
                placeholder="例如：物理A1"
                variant="outlined"
              />
            </v-col>
            <v-col
              cols="12"
              md="6"
            >
              <v-text-field
                v-model.trim="courseGroupForm.code"
                label="教学班代码"
                placeholder="例如：G2-PHY-A1"
                variant="outlined"
              />
            </v-col>
          </v-row>
          <v-row>
            <v-col
              cols="12"
              md="6"
            >
              <v-select
                v-model="courseGroupForm.gradeId"
                :disabled="Boolean(editingCourseGroupId)"
                :items="gradeOptions"
                item-title="title"
                item-value="value"
                label="年级"
                variant="outlined"
                @update:model-value="courseGroupForm.sourceClassIds = []"
              />
            </v-col>
            <v-col
              cols="12"
              md="6"
            >
              <v-select
                v-model="courseGroupForm.subjectId"
                :items="subjectOptions"
                item-title="title"
                item-value="value"
                label="科目"
                variant="outlined"
                @update:model-value="courseGroupForm.sourceClassIds = []"
              />
            </v-col>
          </v-row>
          <v-select
            v-model="courseGroupForm.sourceClassIds"
            :items="courseGroupSourceOptions"
            chips
            closable-chips
            hint="只显示同年级行政班；所选班级必须已将该科设置为走班"
            item-title="title"
            item-value="value"
            label="来源行政班"
            multiple
            persistent-hint
            variant="outlined"
          />
          <v-switch
            v-model="courseGroupForm.isStudentSelectable"
            color="primary"
            label="允许学生自行选择此教学班"
          />
          <v-switch
            v-if="editingCourseGroupId"
            v-model="courseGroupForm.isActive"
            color="primary"
            label="启用此教学班"
          />
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn @click="courseGroupDialog = false">
            取消
          </v-btn>
          <v-btn
            color="primary"
            :loading="loading"
            @click="saveCourseGroup"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";
import {buildSubjectRulePreset} from "@/utils/academicStructure";

const props = defineProps({
  schoolId: {type: String, required: true},
  termId: {type: String, required: true},
});

const section = ref("classes");
const structure = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const selectedClassId = ref("");
const ruleModes = ref({});
const preset = ref("custom");
const presetFixedSubjectIds = ref([]);
const conflictingCourseGroups = ref([]);
const courseGroupDialog = ref(false);
const editingCourseGroupId = ref("");
const courseGroupForm = ref(emptyCourseGroupForm());

const deliveryModeOptions = [
  {title: "随行政班", value: "ADMIN_CLASS"},
  {title: "走班教学", value: "COURSE_GROUP"},
  {title: "本班不开设", value: "NOT_OFFERED"},
];
const presetOptions = [
  {title: "仅必修随班，选科全部走班", value: "all-walking"},
  {title: "单科定班", value: "single-fixed"},
  {title: "三科完全定班", value: "triple-fixed"},
  {title: "全部科目随行政班", value: "all-fixed"},
  {title: "完全自定义", value: "custom"},
];

const administrativeClassOptions = computed(() => (structure.value?.administrativeClasses || []).map((item) => ({
  title: `${item.name} · ${item.code}`,
  value: item.id,
})));
const selectedAdministrativeClass = computed(() => (structure.value?.administrativeClasses || [])
  .find((item) => item.id === selectedClassId.value));
const electiveSubjectOptions = computed(() => (structure.value?.subjects || [])
  .filter((subject) => subject.category !== "CORE")
  .map((subject) => ({title: subject.name, value: subject.id})));
const subjectOptions = computed(() => (structure.value?.subjects || []).map((subject) => ({
  title: `${subject.name} · ${subject.code}`,
  value: subject.id,
})));
const gradeOptions = computed(() => (structure.value?.grades || []).map((grade) => ({
  title: `${grade.name} · ${grade.code}`,
  value: grade.id,
})));
const courseGroupSourceOptions = computed(() => (structure.value?.administrativeClasses || [])
  .filter((item) => item.gradeId === courseGroupForm.value.gradeId && item.subjectRules.some(
    (rule) => rule.subjectId === courseGroupForm.value.subjectId && rule.deliveryMode === "COURSE_GROUP",
  ))
  .map((item) => ({title: `${item.name} · ${item.code}`, value: item.id})));
const sortedCourseGroups = computed(() => [...(structure.value?.courseGroups || [])].sort((left, right) =>
  (left.subject?.sortOrder || 0) - (right.subject?.sortOrder || 0) || left.code.localeCompare(right.code)));

function emptyCourseGroupForm() {
  return {
    name: "",
    code: "",
    gradeId: "",
    subjectId: "",
    sourceClassIds: [],
    isStudentSelectable: true,
    isActive: true,
  };
}

function subjectCategoryLabel(category) {
  return {CORE: "基础科目", ELECTIVE: "选考科目", OTHER: "其他科目"}[category] || "其他科目";
}

function hydrateRules() {
  const rules = new Map((selectedAdministrativeClass.value?.subjectRules || [])
    .map((rule) => [rule.subjectId, rule.deliveryMode]));
  ruleModes.value = Object.fromEntries((structure.value?.subjects || [])
    .map((subject) => [subject.id, rules.get(subject.id) || "NOT_OFFERED"]));
  preset.value = "custom";
  presetFixedSubjectIds.value = [];
  conflictingCourseGroups.value = [];
}

async function loadStructure() {
  if (!props.schoolId || !props.termId) {
    structure.value = null;
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  try {
    structure.value = await classworksV2Api.managedAcademicStructure(props.schoolId, props.termId);
    if (!structure.value.administrativeClasses.some((item) => item.id === selectedClassId.value)) {
      selectedClassId.value = structure.value.administrativeClasses[0]?.id || "";
    } else {
      hydrateRules();
    }
  } catch (error) {
    structure.value = null;
    errorMessage.value = describeApiError(error, "加载授课结构失败");
  } finally {
    loading.value = false;
  }
}

function applyPreset() {
  try {
    ruleModes.value = buildSubjectRulePreset(
      structure.value?.subjects || [],
      preset.value,
      presetFixedSubjectIds.value,
    );
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function saveSubjectRules(removeConflictingSources) {
  if (!selectedClassId.value) return;
  loading.value = true;
  errorMessage.value = "";
  conflictingCourseGroups.value = [];
  try {
    const subjectRules = (structure.value?.subjects || [])
      .filter((subject) => ruleModes.value[subject.id] !== "NOT_OFFERED")
      .map((subject) => ({
        subjectId: subject.id,
        deliveryMode: ruleModes.value[subject.id],
        isCompulsory: ruleModes.value[subject.id] === "ADMIN_CLASS",
      }));
    await classworksV2Api.replaceAdministrativeClassSubjectRules(
      props.schoolId,
      selectedClassId.value,
      {subjectRules, removeConflictingSources},
    );
    successMessage.value = removeConflictingSources
      ? "授课规则已保存，冲突的走班来源关系已解除。"
      : "行政班授课规则已保存。";
    await loadStructure();
  } catch (error) {
    if (error.response?.data?.code === "SUBJECT_RULE_SOURCE_CONFLICT") {
      conflictingCourseGroups.value = error.response.data.details?.courseGroups || [];
      errorMessage.value = "请确认是否解除冲突的走班来源关系。";
    } else {
      errorMessage.value = describeApiError(error, "保存授课规则失败");
    }
  } finally {
    loading.value = false;
  }
}

function openCourseGroupDialog(group = null) {
  const defaultGradeId = structure.value?.grades[0]?.id || "";
  const defaultSubjectId = (structure.value?.subjects || []).find((subject) =>
    (structure.value?.administrativeClasses || []).some((item) =>
      item.gradeId === defaultGradeId && item.subjectRules.some(
        (rule) => rule.subjectId === subject.id && rule.deliveryMode === "COURSE_GROUP",
      )))?.id || structure.value?.subjects[0]?.id || "";
  editingCourseGroupId.value = group?.id || "";
  courseGroupForm.value = group ? {
    name: group.name,
    code: group.code,
    gradeId: group.gradeId,
    subjectId: group.subjectId,
    sourceClassIds: group.sourceClasses.map((item) => item.administrativeClassId),
    isStudentSelectable: group.isStudentSelectable,
    isActive: group.isActive,
  } : {
    ...emptyCourseGroupForm(),
    gradeId: defaultGradeId,
    subjectId: defaultSubjectId,
  };
  courseGroupDialog.value = true;
}

async function saveCourseGroup() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const input = {...courseGroupForm.value};
    if (editingCourseGroupId.value) {
      delete input.gradeId;
      await classworksV2Api.updateManagedCourseGroup(props.schoolId, editingCourseGroupId.value, input);
    } else {
      input.termId = props.termId;
      await classworksV2Api.createManagedCourseGroup(props.schoolId, input);
    }
    courseGroupDialog.value = false;
    successMessage.value = editingCourseGroupId.value ? "走班教学班已更新。" : "走班教学班已创建。";
    await loadStructure();
  } catch (error) {
    errorMessage.value = describeApiError(error, "保存走班教学班失败");
  } finally {
    loading.value = false;
  }
}

watch(() => [props.schoolId, props.termId], loadStructure, {immediate: true});
watch(selectedClassId, hydrateRules);
watch(section, () => {
  errorMessage.value = "";
  conflictingCourseGroups.value = [];
});
</script>

<style scoped>
.subject-rule-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.subject-rule-card {
  min-width: 0;
}
</style>
