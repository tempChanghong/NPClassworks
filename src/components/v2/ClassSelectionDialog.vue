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
          行政班负责语数外等随班课程。每个走班科目都需要选择教学班，或明确标记“我不修读该科”，避免因为漏选而看不到作业。选择保存在本机，可随时修改。
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
          :disabled="!schoolId"
          :items="store.administrativeClasses"
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

        <template v-if="store.courseOptions">
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
              {{ item.subject.name }} · {{ store.courseOptions.administrativeClass.name }}
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
            该班所有已配置课程都随行政班，无需额外选择走班。高二1班、4班通常会看到此状态。
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
          :disabled="!administrativeClassId || loadingOptions || !selectionComplete"
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
import {computed, reactive, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";

const props = defineProps({modelValue: Boolean});
defineEmits(["update:modelValue"]);

const store = useClassworksV2Store();
const schoolId = ref("");
const administrativeClassId = ref("");
const courseDecisions = reactive({});
const loadingOptions = ref(false);
const saving = ref(false);
const error = ref("");

const fixedSubjects = computed(() =>
  (store.courseOptions?.subjects || []).filter((item) => item.followsAdministrativeClass),
);
const streamedSubjects = computed(() =>
  (store.courseOptions?.subjects || []).filter((item) => item.requiresCourseGroupSelection),
);
const generalIssues = computed(() => (store.selectionIssues || []).filter((item) => !item.subjectId));
const selectionComplete = computed(() => streamedSubjects.value.every(
  (item) => Boolean(courseDecisions[item.subject.id]),
));

function decisionOptions(item) {
  const groups = (item.courseGroups || []).map((group) => ({title: group.name, value: group.id}));
  if (!item.isCompulsory) groups.push({title: "我不修读该科", value: "__NOT_TAKING__"});
  return groups;
}

function issueMessages(subjectId) {
  return (store.selectionIssues || [])
    .filter((item) => item.subjectId === subjectId && item.severity === "ERROR")
    .map((item) => item.message);
}

watch(() => props.modelValue, async (open) => {
  if (!open) return;
  schoolId.value = store.selection.schoolId || (store.schools.length === 1 ? store.schools[0].id : "");
  administrativeClassId.value = store.selection.administrativeClassId || "";
  Object.keys(courseDecisions).forEach((key) => delete courseDecisions[key]);
  Object.assign(courseDecisions, store.selection.courseGroupIds || {});
  for (const subjectId of store.selection.declinedSubjectIds || []) {
    courseDecisions[subjectId] = "__NOT_TAKING__";
  }
  if (schoolId.value && store.term?.schoolId !== schoolId.value) {
    await handleSchoolChange(schoolId.value);
  }
  if (administrativeClassId.value && !store.courseOptions) {
    await handleAdministrativeClassChange(administrativeClassId.value);
  }
}, {immediate: true});

async function handleSchoolChange(value) {
  error.value = "";
  store.selectionIssues = [];
  administrativeClassId.value = "";
  Object.keys(courseDecisions).forEach((key) => delete courseDecisions[key]);
  try {
    await store.loadSchool(value);
  } catch (caught) {
    error.value = caught.response?.data?.message || caught.message || "加载班级失败";
  }
}

async function handleAdministrativeClassChange(value) {
  error.value = "";
  store.selectionIssues = [];
  Object.keys(courseDecisions).forEach((key) => delete courseDecisions[key]);
  if (!value) return;
  loadingOptions.value = true;
  try {
    await store.loadCourseOptions(value);
  } catch (caught) {
    error.value = caught.response?.data?.message || caught.message || "加载走班选项失败";
  } finally {
    loadingOptions.value = false;
  }
}

async function commit() {
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
    });
  } catch (caught) {
    error.value = caught.response?.data?.message || caught.message || "保存选择失败";
  } finally {
    saving.value = false;
  }
}

</script>
