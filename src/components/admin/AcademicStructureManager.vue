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
      <v-tab value="organization">
        年级与行政班
      </v-tab>
      <v-tab value="classes">
        行政班授课规则
      </v-tab>
      <v-tab value="groups">
        走班教学班与来源
      </v-tab>
    </v-tabs>

    <v-window v-model="section">
      <v-window-item value="organization">
        <v-card class="rounded-xl">
          <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5">
            年级与行政班
            <v-spacer />
            <v-btn
              color="primary"
              prepend-icon="mdi-school-outline"
              @click="openGradeDialog()"
            >
              新建年级
            </v-btn>
          </v-card-title>
          <v-card-text class="px-5 pb-5">
            <v-alert
              class="mb-4"
              type="info"
              variant="tonal"
            >
              这里维护当前学期的年级和行政班。学校名称、学校代码和登录方式已经由首次配置保存，无需重复导入 JSON。
            </v-alert>
            <div class="grade-grid">
              <v-card
                v-for="grade in structure?.grades || []"
                :key="grade.id"
                class="grade-card"
                variant="outlined"
              >
                <v-card-title class="d-flex align-center ga-2 px-4 pt-4">
                  <div class="min-width-0">
                    <div class="text-h6 text-truncate">
                      {{ grade.name }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ grade.code }} · 排序 {{ grade.sortOrder }}
                    </div>
                  </div>
                  <v-spacer />
                  <v-btn
                    icon="mdi-pencil-outline"
                    size="small"
                    variant="text"
                    @click="openGradeDialog(grade)"
                  />
                </v-card-title>
                <v-card-text class="px-4 pb-4">
                  <div class="d-flex align-center mb-3">
                    <span class="text-subtitle-2">行政班</span>
                    <v-spacer />
                    <v-btn
                      prepend-icon="mdi-account-multiple-plus-outline"
                      size="small"
                      variant="tonal"
                      @click="openAdministrativeClassDialog(grade.id)"
                    >
                      新建班级
                    </v-btn>
                  </div>
                  <v-list
                    v-if="administrativeClassesForGrade(grade.id).length"
                    class="pa-0 rounded-lg"
                    density="compact"
                  >
                    <v-list-item
                      v-for="item in administrativeClassesForGrade(grade.id)"
                      :key="item.id"
                      :subtitle="`${item.code} · ${item.isActive ? '启用' : '停用'}`"
                      :title="item.name"
                    >
                      <template #prepend>
                        <v-icon :color="item.isActive ? 'primary' : 'grey'">
                          mdi-account-group-outline
                        </v-icon>
                      </template>
                      <template #append>
                        <v-btn
                          icon="mdi-pencil-outline"
                          size="small"
                          variant="text"
                          @click="openAdministrativeClassDialog(grade.id, item)"
                        />
                      </template>
                    </v-list-item>
                  </v-list>
                  <div
                    v-else
                    class="text-body-2 text-medium-emphasis py-3"
                  >
                    尚未创建行政班
                  </div>
                </v-card-text>
              </v-card>
            </div>
            <v-empty-state
              v-if="!structure?.grades?.length && !loading"
              icon="mdi-school-outline"
              text="当前学期还没有年级，请先新建年级"
            />
          </v-card-text>
        </v-card>
      </v-window-item>

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

    <v-dialog
      v-model="gradeDialog"
      max-width="560"
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          {{ editingGradeId ? "编辑年级" : "新建年级" }}
        </v-card-title>
        <v-card-text class="px-5">
          <v-text-field
            v-model.trim="gradeForm.name"
            label="年级名称"
            placeholder="例如：高二"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="gradeForm.code"
            hint="2—64位字母、数字、点、横线或下划线；保存后统一转为大写"
            label="年级代码"
            persistent-hint
            placeholder="例如：G2"
            variant="outlined"
          />
          <v-text-field
            v-model="gradeForm.sortOrder"
            label="显示顺序"
            max="10000"
            min="-10000"
            step="1"
            type="number"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn @click="gradeDialog = false">
            取消
          </v-btn>
          <v-btn
            color="primary"
            :disabled="!gradeForm.name || !gradeForm.code"
            :loading="loading"
            @click="saveGrade"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="administrativeClassDialog"
      max-width="600"
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          {{ editingAdministrativeClassId ? "编辑行政班" : "新建行政班" }}
        </v-card-title>
        <v-card-text class="px-5">
          <v-select
            v-model="administrativeClassForm.gradeId"
            :disabled="Boolean(editingAdministrativeClassId)"
            :items="gradeOptions"
            item-title="title"
            item-value="value"
            label="所属年级"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="administrativeClassForm.name"
            label="班级名称"
            placeholder="例如：高二1班"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="administrativeClassForm.code"
            hint="建议包含年级和班号，例如 G2-C01"
            label="班级代码"
            persistent-hint
            variant="outlined"
          />
          <v-switch
            v-model="administrativeClassForm.isStudentSelectable"
            color="primary"
            label="允许学生自行选择此行政班"
          />
          <v-switch
            v-if="editingAdministrativeClassId"
            v-model="administrativeClassForm.isActive"
            color="primary"
            label="启用此行政班"
          />
        </v-card-text>
        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn @click="administrativeClassDialog = false">
            取消
          </v-btn>
          <v-btn
            color="primary"
            :disabled="!administrativeClassForm.gradeId || !administrativeClassForm.name || !administrativeClassForm.code"
            :loading="loading"
            @click="saveAdministrativeClass"
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

const section = ref("organization");
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
const gradeDialog = ref(false);
const editingGradeId = ref("");
const gradeForm = ref(emptyGradeForm());
const administrativeClassDialog = ref(false);
const editingAdministrativeClassId = ref("");
const administrativeClassForm = ref(emptyAdministrativeClassForm());

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

function emptyGradeForm() {
  return {name: "", code: "", sortOrder: (structure.value?.grades?.length || 0) * 10};
}

function emptyAdministrativeClassForm() {
  return {name: "", code: "", gradeId: "", isStudentSelectable: true, isActive: true};
}

function administrativeClassesForGrade(gradeId) {
  return (structure.value?.administrativeClasses || [])
    .filter((item) => item.gradeId === gradeId)
    .sort((left, right) => left.code.localeCompare(right.code));
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

function openGradeDialog(grade = null) {
  editingGradeId.value = grade?.id || "";
  gradeForm.value = grade
    ? {name: grade.name, code: grade.code, sortOrder: grade.sortOrder}
    : emptyGradeForm();
  gradeDialog.value = true;
}

async function saveGrade() {
  loading.value = true;
  errorMessage.value = "";
  try {
    if (editingGradeId.value) {
      await classworksV2Api.updateManagedGrade(props.schoolId, editingGradeId.value, gradeForm.value);
    } else {
      await classworksV2Api.createManagedGrade(props.schoolId, {...gradeForm.value, termId: props.termId});
    }
    gradeDialog.value = false;
    successMessage.value = editingGradeId.value ? "年级已更新。" : "年级已创建。";
    await loadStructure();
  } catch (error) {
    errorMessage.value = describeApiError(error, "保存年级失败");
  } finally {
    loading.value = false;
  }
}

function openAdministrativeClassDialog(gradeId, administrativeClass = null) {
  editingAdministrativeClassId.value = administrativeClass?.id || "";
  administrativeClassForm.value = administrativeClass ? {
    name: administrativeClass.name,
    code: administrativeClass.code,
    gradeId: administrativeClass.gradeId,
    isStudentSelectable: administrativeClass.isStudentSelectable,
    isActive: administrativeClass.isActive,
  } : {...emptyAdministrativeClassForm(), gradeId};
  administrativeClassDialog.value = true;
}

async function saveAdministrativeClass() {
  loading.value = true;
  errorMessage.value = "";
  try {
    if (editingAdministrativeClassId.value) {
      const input = {...administrativeClassForm.value};
      delete input.gradeId;
      await classworksV2Api.updateManagedAdministrativeClass(
        props.schoolId,
        editingAdministrativeClassId.value,
        input,
      );
    } else {
      await classworksV2Api.createManagedAdministrativeClass(
        props.schoolId,
        {...administrativeClassForm.value, termId: props.termId},
      );
    }
    administrativeClassDialog.value = false;
    successMessage.value = editingAdministrativeClassId.value ? "行政班已更新。" : "行政班已创建。请继续配置授课规则。";
    await loadStructure();
  } catch (error) {
    errorMessage.value = describeApiError(error, "保存行政班失败");
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

.grade-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.grade-card,
.min-width-0 {
  min-width: 0;
}
</style>
