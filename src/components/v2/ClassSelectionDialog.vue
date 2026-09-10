<template>
  <v-dialog
    :model-value="modelValue"
    max-width="760"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center pa-5">
        <v-icon
          class="mr-3"
          color="primary"
          icon="mdi-school-outline"
        />
        选择我的班级
        <v-spacer />
        <v-btn
          v-if="store.selection.administrativeClassId"
          icon="mdi-close"
          variant="text"
          @click="$emit('update:modelValue', false)"
        />
      </v-card-title>

      <v-card-text class="px-5">
        <v-alert
          class="mb-5"
          type="info"
          variant="tonal"
        >
          先选择行政班，再为每个走班科目选择教学班或标记“我不修读该科”。选择保存在本机，可随时修改。
        </v-alert>

        <v-alert
          v-if="store.selectionNeedsConfirmation"
          class="mb-4"
          type="warning"
          variant="tonal"
        >
          学校分班配置发生变化，或旧选班信息不完整，请重新确认。
        </v-alert>

        <v-select
          v-model="schoolId"
          :disabled="saving"
          :items="store.schools"
          item-title="name"
          item-value="id"
          label="学校"
          prepend-inner-icon="mdi-domain"
          variant="outlined"
          @update:model-value="handleSchoolChange"
        />

        <v-select
          v-model="administrativeClassId"
          :disabled="!schoolId || loadingOptions || saving"
          :items="catalog?.administrativeClasses || []"
          item-title="name"
          item-value="id"
          label="行政班"
          prepend-inner-icon="mdi-account-group"
          variant="outlined"
          @update:model-value="handleAdministrativeClassChange"
        />

        <v-progress-linear
          v-if="loadingOptions"
          class="mb-4"
          indeterminate
          rounded
        />

        <template v-if="courseOptions">
          <div class="text-subtitle-1 font-weight-bold mb-2">
            随行政班课程
          </div>
          <div class="d-flex flex-wrap ga-2 mb-5">
            <v-chip
              v-for="item in fixedSubjects"
              :key="item.subject.id"
              color="success"
              prepend-icon="mdi-check-circle-outline"
              variant="tonal"
            >
              {{ item.subject.name }} · {{ courseOptions.administrativeClass.name }}
            </v-chip>
          </div>

          <template v-if="streamedSubjects.length">
            <div class="text-subtitle-1 font-weight-bold mb-2">
              我的走班课程
            </div>
            <v-select
              v-for="item in streamedSubjects"
              :key="item.subject.id"
              v-model="courseDecisions[item.subject.id]"
              :disabled="saving"
              :error-messages="issueMessages(item.subject.id)"
              :items="decisionOptions(item)"
              :label="`${item.subject.name}（必须确认）`"
              item-title="title"
              item-value="value"
              prepend-inner-icon="mdi-swap-horizontal"
              variant="outlined"
            />
          </template>

          <v-alert
            v-else
            color="success"
            icon="mdi-check-decagram-outline"
            variant="tonal"
          >
            该班所有课程都随行政班，不需要选择走班教学班。
          </v-alert>
        </template>

        <v-alert
          v-if="generalIssues.length"
          class="mt-4"
          type="warning"
          variant="tonal"
        >
          <div
            v-for="item in generalIssues"
            :key="`${item.code}-${item.subjectId || ''}`"
          >
            {{ item.message }}
          </div>
        </v-alert>

        <v-alert
          v-if="error"
          class="mt-4"
          type="error"
          variant="tonal"
        >
          {{ error }}
        </v-alert>
      </v-card-text>

      <v-card-actions class="pa-5 pt-2">
        <v-spacer />
        <v-btn
          :disabled="!administrativeClassId || loadingOptions || !courseOptions || !selectionComplete"
          :loading="saving"
          color="primary"
          prepend-icon="mdi-content-save-check"
          size="large"
          variant="elevated"
          @click="commit"
        >
          保存并查看作业
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, onBeforeUnmount, reactive, ref, watch} from "vue";
import {classworksV2Api} from "@/utils/classworksV2Client";
import {useClassworksV2Store} from "@/stores/classworksV2";

const props = defineProps({modelValue: Boolean});
defineEmits(["update:modelValue"]);

const store = useClassworksV2Store();
const catalog = ref(null);
const courseOptions = ref(null);
const issues = ref([]);
let generation = 0;
onBeforeUnmount(() => { generation++; });
const schoolId = ref("");
const administrativeClassId = ref("");
const courseDecisions = reactive({});
const loadingOptions = ref(false);
const saving = ref(false);
const error = ref("");

const fixedSubjects = computed(() =>
  (courseOptions.value?.subjects || []).filter((item) => item.followsAdministrativeClass),
);
const streamedSubjects = computed(() =>
  (courseOptions.value?.subjects || []).filter((item) => item.requiresCourseGroupSelection),
);
const generalIssues = computed(() => issues.value.filter((item) => !item.subjectId));
const selectionComplete = computed(() => streamedSubjects.value.every(
  (item) => decisionOptions(item).some(option => option.value === courseDecisions[item.subject.id]),
));

function decisionOptions(item) {
  const groups = (item.courseGroups || [])
    .filter(group => group.isActive !== false && group.isStudentSelectable !== false)
    .map((group) => ({title: group.name, value: group.id}));
  if (!item.isCompulsory) groups.push({title: "我不修读该科", value: "__NOT_TAKING__"});
  return groups;
}

// Realtime recovery of the active board may invalidate choices in the open draft.
watch(() => store.courseOptions, value => {
  if (props.modelValue && value?.administrativeClass?.id === administrativeClassId.value) {
    courseOptions.value = value;
  }
});
watch(courseOptions, () => {
  if (!props.modelValue || courseOptions.value?.administrativeClass?.id !== administrativeClassId.value) return;
  for (const subjectId of Object.keys(courseDecisions)) {
    const item = streamedSubjects.value.find(subject => subject.subject.id === subjectId);
    if (!item || !decisionOptions(item).some(option => option.value === courseDecisions[subjectId])) {
      delete courseDecisions[subjectId];
    }
  }
});

function issueMessages(subjectId) {
  return issues.value
    .filter((item) => item.subjectId === subjectId && item.severity === "ERROR")
    .map((item) => item.message);
}

watch(() => props.modelValue, async (open) => {
  const version = ++generation;
  saving.value = false;
  loadingOptions.value = false;
  error.value = "";
  if (!open) return;
  schoolId.value = store.selection.schoolId || (store.schools.length === 1 ? store.schools[0].id : "");
  administrativeClassId.value = store.selection.administrativeClassId || "";
  Object.keys(courseDecisions).forEach(key => delete courseDecisions[key]);
  Object.assign(courseDecisions, store.selection.courseGroupIds || {});
  for (const subjectId of store.selection.declinedSubjectIds || []) courseDecisions[subjectId] = "__NOT_TAKING__";
  issues.value = [...store.selectionIssues];
  catalog.value = store.term?.schoolId === schoolId.value ? {
    schoolId: schoolId.value, term: store.term, grades: store.grades,
    administrativeClasses: store.administrativeClasses, subjects: store.studentSubjects,
  } : null;
  courseOptions.value = store.courseOptions?.administrativeClass?.id === administrativeClassId.value ? store.courseOptions : null;
  loadingOptions.value = true;
  try {
    if (schoolId.value && !catalog.value) {
      const result = await store.fetchSchoolCatalog(schoolId.value);
      if (version !== generation) return;
      catalog.value = result;
    }
    if (administrativeClassId.value && !courseOptions.value) {
      const result = await classworksV2Api.courseOptions(administrativeClassId.value);
      if (version !== generation) return;
      courseOptions.value = result;
    }
  } catch (caught) {
    if (version === generation) error.value = caught.response?.data?.message || caught.message || "加载班级失败";
  } finally {
    if (version === generation) loadingOptions.value = false;
  }
}, {immediate: true, flush: "sync"});

async function handleSchoolChange(value) {
  const version = ++generation;
  schoolId.value = value;
  error.value = "";
  issues.value = [];
  catalog.value = null;
  courseOptions.value = null;
  administrativeClassId.value = "";
  Object.keys(courseDecisions).forEach(key => delete courseDecisions[key]);
  loadingOptions.value = Boolean(value);
  if (!value) return;
  try {
    const result = await store.fetchSchoolCatalog(value);
    if (version === generation) catalog.value = result;
  } catch (caught) {
    if (version === generation) error.value = caught.response?.data?.message || caught.message || "加载班级失败";
  } finally {
    if (version === generation) loadingOptions.value = false;
  }
}

async function handleAdministrativeClassChange(value) {
  const version = ++generation;
  administrativeClassId.value = value;
  error.value = "";
  issues.value = [];
  courseOptions.value = null;
  Object.keys(courseDecisions).forEach(key => delete courseDecisions[key]);
  loadingOptions.value = Boolean(value);
  if (!value) return;
  try {
    const result = await classworksV2Api.courseOptions(value);
    if (version === generation) courseOptions.value = result;
  } catch (caught) {
    if (version === generation) error.value = caught.response?.data?.message || caught.message || "加载走班选项失败";
  } finally {
    if (version === generation) loadingOptions.value = false;
  }
}

async function commit() {
  if (saving.value || loadingOptions.value || !catalog.value || !courseOptions.value || !selectionComplete.value) return;
  const version = generation;
  const isCurrent = () => version === generation && props.modelValue;
  saving.value = true;
  error.value = "";
  try {
    await store.commitStudentSelection({
      schoolId: schoolId.value,
      administrativeClassId: administrativeClassId.value,
      courseGroupIds: Object.fromEntries(Object.entries(courseDecisions)
        .filter(([, value]) => value && value !== "__NOT_TAKING__")),
      declinedSubjectIds: Object.entries(courseDecisions)
        .filter(([, value]) => value === "__NOT_TAKING__")
        .map(([subjectId]) => subjectId),
    }, {catalog: catalog.value, courseOptions: courseOptions.value, isCurrent,
      onInvalid: (nextIssues, options) => { issues.value = nextIssues; courseOptions.value = options; },
    });
  } catch (caught) {
    if (isCurrent()) error.value = caught.response?.data?.message || caught.message || "保存选择失败";
  } finally {
    if (isCurrent()) saving.value = false;
  }
}

</script>
