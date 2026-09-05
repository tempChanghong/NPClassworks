<template>
  <v-bottom-sheet
    :model-value="modelValue"
    inset
    max-height="88vh"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="screen-composer rounded-t-xl">
      <v-card-title class="screen-composer__title d-flex align-center pa-5 pb-3">
        <v-icon
          class="mr-3"
          color="primary"
          icon="mdi-monitor-edit"
        />
        {{ publication ? "修改作业" : "快速录入作业" }}
        <v-spacer />
        <v-chip
          prepend-icon="mdi-history"
          size="small"
          variant="tonal"
        >
          自动保留历史版本
        </v-chip>
      </v-card-title>

      <v-card-text class="screen-composer__body px-5">
        <v-alert
          v-if="draftRestored"
          class="mb-4"
          color="info"
          icon="mdi-file-restore-outline"
          variant="tonal"
        >
          已自动恢复这台大屏上次未保存的内容。
          <template #append>
            <v-btn
              variant="text"
              @click="discardRecoveredDraft"
            >
              放弃草稿
            </v-btn>
          </template>
        </v-alert>

        <section class="composer-section">
          <div class="composer-section__label">
            1. 选择科目
          </div>
          <div class="subject-choice-grid">
            <v-btn
              v-for="subject in eligibleSubjects"
              :key="subject.id"
              :color="form.subjectId === subject.id ? 'primary' : undefined"
              height="62"
              :variant="form.subjectId === subject.id ? 'flat' : 'tonal'"
              @click="form.subjectId = subject.id"
            >
              {{ subject.name }}
            </v-btn>
          </div>
        </section>

        <section
          v-if="form.subjectId"
          class="composer-section"
        >
          <div class="composer-section__label">
            2. 发布到
          </div>
          <v-alert
            v-if="eligibleTargets.length === 1"
            color="success"
            icon="mdi-check-circle-outline"
            variant="tonal"
          >
            <strong>{{ eligibleTargets[0].name }}</strong>
            <span class="ml-2">{{ targetSubtitle(eligibleTargets[0]) }}，已自动选择</span>
          </v-alert>
          <div
            v-else-if="eligibleTargets.length > 1"
            class="target-choice-grid"
          >
            <v-btn
              v-for="workspace in eligibleTargets"
              :key="workspace.id"
              class="target-choice"
              :color="form.targetWorkspaceId === workspace.id ? 'primary' : undefined"
              height="72"
              :variant="form.targetWorkspaceId === workspace.id ? 'flat' : 'tonal'"
              @click="form.targetWorkspaceId = workspace.id"
            >
              <span class="target-choice__content">
                <strong>{{ workspace.name }}</strong>
                <small>{{ targetSubtitle(workspace) }}</small>
              </span>
            </v-btn>
          </div>
          <v-alert
            v-else
            type="warning"
            variant="tonal"
          >
            当前大屏没有配置该科目的可用教学班，请联系管理员检查授课结构。
          </v-alert>
        </section>

        <section class="composer-section">
          <div class="composer-section__label">
            3. 输入作业
          </div>
          <v-textarea
            ref="contentInput"
            v-model="form.content"
            auto-grow
            autofocus
            class="screen-content-input"
            hide-details="auto"
            label="作业内容"
            :placeholder="contentFocused ? '例如：完成练习册第 10～12 页' : ''"
            rows="4"
            variant="outlined"
            @blur="contentFocused = false"
            @focus="contentFocused = true"
          />
          <HomeworkQuickInputBar
            density="screen"
            :items="quickInputs"
            :subject-id="form.subjectId"
            @insert="insertQuickInput"
          />
        </section>

        <section class="composer-section">
          <div class="composer-section__label">
            截止时间
          </div>
          <div class="d-flex align-center flex-wrap ga-2">
            <v-btn
              v-for="(preset, index) in quickDeadlines"
              :key="`${preset.label}-${preset.dateRule || 'relative'}-${preset.dayOffset ?? preset.weekday}-${preset.time}-${index}`"
              variant="tonal"
              @click="setQuickDeadline(preset)"
            >
              {{ preset.label }}
            </v-btn>
            <v-btn
              v-if="form.dueAt"
              prepend-icon="mdi-close"
              variant="text"
              @click="form.dueAt = ''"
            >
              清除
            </v-btn>
            <v-chip
              v-if="form.dueAt"
              color="primary"
              prepend-icon="mdi-calendar-clock"
              variant="tonal"
            >
              {{ dueAtLabel }}
            </v-chip>
          </div>
        </section>

        <v-expansion-panels
          v-model="advancedPanel"
          class="mb-4"
          variant="accordion"
        >
          <v-expansion-panel value="advanced">
            <v-expansion-panel-title>
              更多设置：标题、日期、自定义截止时间和优先级
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-row>
                <v-col
                  cols="12"
                  md="6"
                >
                  <v-text-field
                    v-model="form.title"
                    label="标题（可选）"
                    variant="outlined"
                  />
                </v-col>
                <v-col
                  cols="12"
                  md="6"
                >
                  <v-text-field
                    v-model="form.boardDate"
                    label="作业板日期"
                    type="date"
                    variant="outlined"
                  />
                </v-col>
                <v-col
                  cols="12"
                  md="6"
                >
                  <v-text-field
                    v-model="form.dueAt"
                    label="自定义截止时间"
                    type="datetime-local"
                    variant="outlined"
                  />
                </v-col>
                <v-col
                  cols="12"
                  md="6"
                >
                  <v-select
                    v-model="form.priority"
                    :items="priorities"
                    item-title="title"
                    item-value="value"
                    label="优先级"
                    variant="outlined"
                  />
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-alert
          v-if="duplicateWarning"
          class="mb-4"
          color="warning"
          icon="mdi-content-duplicate"
          title="相同作业可能已经录入"
          variant="tonal"
        >
          <div>{{ duplicateWarning.message }}。本次输入尚未保存，请先核对。</div>
          <v-list
            class="duplicate-list mt-2 rounded-lg"
            density="compact"
            lines="two"
          >
            <v-list-item
              v-for="item in duplicateWarning.duplicates"
              :key="item.id"
              prepend-icon="mdi-book-check-outline"
              :subtitle="duplicateAssignmentDescription(item)"
              :title="item.title || item.content || '未命名作业'"
            />
          </v-list>
          <div class="d-flex flex-wrap ga-2 mt-3">
            <v-btn
              prepend-icon="mdi-pencil-outline"
              variant="text"
              @click="duplicateWarning = null"
            >
              返回修改
            </v-btn>
            <v-btn
              :loading="saving"
              prepend-icon="mdi-content-save-check-outline"
              variant="flat"
              @click="save(true)"
            >
              确认仍然保存
            </v-btn>
          </div>
        </v-alert>

        <v-alert
          v-if="conflict"
          class="mb-4"
          color="warning"
          icon="mdi-source-branch-sync"
          title="其他设备已经修改了这项作业"
          variant="tonal"
        >
          <div>{{ conflictMessage }}</div>
          <div
            v-if="screenConflictRows.length"
            class="screen-conflict-comparison mt-3"
          >
            <div
              v-for="row in screenConflictRows"
              :key="row.key"
              class="screen-conflict-comparison__row"
            >
              <strong>{{ row.label }}</strong>
              <span>服务器：{{ row.currentValue }}</span>
              <span>本机：{{ row.localValue }}</span>
            </div>
          </div>
          <div class="d-flex flex-wrap ga-2 mt-3">
            <v-btn
              :loading="conflictReloading"
              prepend-icon="mdi-cloud-download-outline"
              variant="flat"
              @click="reloadLatest"
            >
              放弃本机输入并载入最新版
            </v-btn>
            <v-btn
              v-if="conflict.latestPublication"
              :loading="conflictApplying"
              prepend-icon="mdi-source-merge"
              variant="tonal"
              @click="applyLocalOnLatest"
            >
              以本机输入生成新版本
            </v-btn>
            <v-btn
              :loading="conflictCopying"
              prepend-icon="mdi-content-copy"
              variant="tonal"
              @click="saveConflictCopy"
            >
              另存为一项新作业
            </v-btn>
          </div>
        </v-alert>

        <v-alert
          v-if="localError || store.screenError"
          class="mb-4"
          type="error"
          variant="tonal"
        >
          {{ localError || store.screenError }}
        </v-alert>
      </v-card-text>

      <v-card-actions class="screen-composer__actions px-5 py-4">
        <div class="text-body-2 text-medium-emphasis">
          大屏保存后默认为“待教师确认”
        </div>
        <v-spacer />
        <v-btn
          size="large"
          @click="$emit('update:modelValue', false)"
        >
          取消
        </v-btn>
        <v-btn
          color="primary"
          :disabled="!canSave || Boolean(conflict || duplicateWarning)"
          :loading="saving"
          min-width="180"
          prepend-icon="mdi-content-save-outline"
          size="x-large"
          @click="save(false)"
        >
          保存作业
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup>
import {computed, nextTick, reactive, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import HomeworkQuickInputBar from "@/components/v2/HomeworkQuickInputBar.vue";
import {todayBoardDate} from "@/utils/boardDate";
import {
  resolveHomeworkQuickDeadline,
  sanitizeHomeworkQuickDeadlines,
} from "@/utils/homeworkQuickDeadlines";
import {insertHomeworkQuickInput, sanitizeHomeworkQuickInputs} from "@/utils/homeworkQuickInputs";
import {
  clearScreenHomeworkDraft,
  loadScreenHomeworkDraft,
  saveScreenHomeworkDraft,
} from "@/utils/screenHomeworkDraft";
import {
  publicationConflictMessage,
  publicationConflictState,
} from "@/utils/publicationConflict";
import {buildConflictComparison, PUBLICATION_CONFLICT_FIELDS} from "@/utils/conflictComparison";
import {
  duplicateAssignmentDescription,
  publicationDuplicateState,
} from "@/utils/publicationDuplicate";
import {confirmAction} from "@/utils/actionDialog";

const props = defineProps({
  modelValue: Boolean,
  publication: {
    type: Object,
    default: null,
  },
});
const emit = defineEmits(["update:modelValue", "saved"]);
const store = useClassworksV2Store();
const saving = ref(false);
const localError = ref("");
const basePublication = ref(props.publication);
const conflict = ref(null);
const conflictReloading = ref(false);
const conflictCopying = ref(false);
const conflictApplying = ref(false);
const duplicateWarning = ref(null);
const contentFocused = ref(false);
const contentInput = ref(null);
const advancedPanel = ref();
const draftRestored = ref(false);
const draftReady = ref(false);
const form = reactive({
  subjectId: "",
  targetWorkspaceId: "",
  title: "",
  content: "",
  boardDate: todayBoardDate(),
  dueAt: "",
  priority: "NORMAL",
});

const priorities = [
  {title: "普通", value: "NORMAL"},
  {title: "重要", value: "IMPORTANT"},
  {title: "紧急", value: "URGENT"},
];
const eligibleSubjects = computed(() => store.studentSubjects.filter(
  (subject) => store.eligibleScreenWorkspaces(subject.id).length > 0,
));
const eligibleTargets = computed(() => store.eligibleScreenWorkspaces(form.subjectId));
const quickDeadlines = computed(() => sanitizeHomeworkQuickDeadlines(
  store.screenSession?.homeworkSettings?.quickDeadlines,
));
const quickInputs = computed(() => sanitizeHomeworkQuickInputs(
  store.screenSession?.homeworkSettings?.quickInputs,
));
const canSave = computed(() => Boolean(
  form.subjectId &&
  form.targetWorkspaceId &&
  (form.title.trim() || form.content.trim()),
));
const conflictMessage = computed(() => publicationConflictMessage(conflict.value));
const screenConflictInput = computed(() => ({
  subjectId: form.subjectId,
  targetWorkspaceIds: [form.targetWorkspaceId],
  title: form.title,
  content: form.content,
  boardDate: form.boardDate,
  dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
  priority: form.priority,
  publishAt: basePublication.value?.publishAt,
  status: "PUBLISHED",
}));
const screenConflictRows = computed(() => buildConflictComparison(
  screenConflictInput.value,
  conflict.value?.latestPublication,
  PUBLICATION_CONFLICT_FIELDS,
));
const dueAtLabel = computed(() => form.dueAt
  ? new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(form.dueAt))
  : "");

watch(() => props.publication, (publication) => {
  basePublication.value = publication;
  conflict.value = null;
  duplicateWarning.value = null;
  loadPublication(publication);
}, {immediate: true});
watch(() => props.modelValue, (open) => {
  if (open) restoreDraft();
  else draftReady.value = false;
});
watch(() => form.subjectId, () => {
  if (!eligibleTargets.value.some((workspace) => workspace.id === form.targetWorkspaceId)) {
    form.targetWorkspaceId = eligibleTargets.value.length === 1 ? eligibleTargets.value[0].id : "";
  }
});
watch(form, () => {
  duplicateWarning.value = null;
  if (!props.modelValue || !draftReady.value) return;
  saveScreenHomeworkDraft(
    store.screenSession?.binding?.id,
    basePublication.value?.id || "new",
    form,
  );
}, {deep: true});

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function insertQuickInput(item) {
  const textarea = contentInput.value?.$el?.querySelector("textarea");
  const result = insertHomeworkQuickInput(form.content, textarea?.selectionStart, textarea?.selectionEnd, item);
  form.content = result.value;
  await nextTick();
  const nextTextarea = contentInput.value?.$el?.querySelector("textarea");
  nextTextarea?.focus();
  nextTextarea?.setSelectionRange(result.cursor, result.cursor);
}

function loadPublication(publication) {
  localError.value = "";
  advancedPanel.value = publication ? "advanced" : undefined;
  form.subjectId = publication?.subjectId || "";
  form.targetWorkspaceId = store.screenEditableWorkspaceId(publication)
    || publication?.targets?.[0]?.workspaceId
    || "";
  form.title = publication?.title || "";
  form.content = publication?.content || "";
  form.boardDate = publication?.boardDate
    ? String(publication.boardDate).slice(0, 10)
    : store.boardDate;
  form.dueAt = localDateTime(publication?.dueAt);
  form.priority = publication?.priority || "NORMAL";
}

function restoreDraft() {
  draftReady.value = false;
  draftRestored.value = false;
  loadPublication(basePublication.value);
  const draft = loadScreenHomeworkDraft(
    store.screenSession?.binding?.id,
    basePublication.value?.id || "new",
  );
  if (draft) {
    Object.assign(form, draft);
    draftRestored.value = true;
  }
  nextTick(() => {
    draftReady.value = true;
  });
}

function discardRecoveredDraft() {
  clearScreenHomeworkDraft(
    store.screenSession?.binding?.id,
    basePublication.value?.id || "new",
  );
  draftReady.value = false;
  draftRestored.value = false;
  loadPublication(basePublication.value);
  nextTick(() => {
    draftReady.value = true;
  });
}

function targetSubtitle(workspace) {
  if (workspace.type === "ADMIN_CLASS") return "本行政班 · 随班科目";
  const sources = workspace.sourceClasses
    ?.map((item) => item.administrativeClass?.name)
    .filter(Boolean)
    .join("、");
  return sources ? `走班教学班 · 涉及 ${sources}` : "相关走班教学班";
}

function setQuickDeadline(preset) {
  form.dueAt = localDateTime(resolveHomeworkQuickDeadline(preset));
}

async function save(allowDuplicate = false) {
  localError.value = "";
  if (!form.subjectId || !form.targetWorkspaceId) {
    localError.value = "请选择科目和具体班级";
    return;
  }
  if (!form.title.trim() && !form.content.trim()) {
    localError.value = "标题和作业内容不能同时为空";
    return;
  }
  saving.value = true;
  try {
    const savedContext = {
      subjectName: eligibleSubjects.value.find((subject) => subject.id === form.subjectId)?.name || "作业",
      targetName: eligibleTargets.value.find((workspace) => workspace.id === form.targetWorkspaceId)?.name || "目标班级",
      operation: basePublication.value ? "updated" : "created",
    };
    const saved = await store.saveScreenPublication({
      subjectId: form.subjectId,
      targetWorkspaceIds: [form.targetWorkspaceId],
      title: form.title,
      content: form.content,
      boardDate: form.boardDate,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      priority: form.priority,
      publishAt: basePublication.value?.publishAt || new Date().toISOString(),
      ...(allowDuplicate ? {allowDuplicate: true} : {}),
    }, basePublication.value, savedContext);
    clearScreenHomeworkDraft(
      store.screenSession?.binding?.id,
      basePublication.value?.id || "new",
    );
    draftReady.value = false;
    draftRestored.value = false;
    emit("saved", saved, savedContext);
    emit("update:modelValue", false);
  } catch (error) {
    const duplicate = publicationDuplicateState(error);
    if (duplicate) {
      duplicateWarning.value = duplicate;
      conflict.value = null;
      localError.value = "";
      store.screenError = "";
      return;
    }
    const nextConflict = publicationConflictState(error, basePublication.value?.revision);
    if (nextConflict) {
      localError.value = "";
      store.screenError = "";
      try {
        const latestPublication = await store.latestPublication(basePublication.value.id, "screen");
        conflict.value = {...nextConflict, latestPublication};
      } catch {
        conflict.value = nextConflict;
      }
    } else {
      localError.value = error.message || "保存失败，当前输入已保留，请重试。";
    }
  } finally {
    saving.value = false;
  }
}

async function applyLocalOnLatest() {
  const latest = conflict.value?.latestPublication;
  if (!latest) return;
  if (!await confirmAction({
    title: "用本机输入生成新版本",
    message: "服务器当前版本会保留在历史中，本机输入将成为下一个待教师确认版本。",
    confirmText: "保存新版本",
    color: "warning",
  })) return;
  conflictApplying.value = true;
  localError.value = "";
  try {
    const context = {
      subjectName: eligibleSubjects.value.find((subject) => subject.id === form.subjectId)?.name || "作业",
      targetName: eligibleTargets.value.find((workspace) => workspace.id === form.targetWorkspaceId)?.name || "目标班级",
      operation: "updated",
    };
    const saved = await store.saveScreenPublication(screenConflictInput.value, latest, context);
    clearScreenHomeworkDraft(store.screenSession?.binding?.id, basePublication.value?.id || "new");
    conflict.value = null;
    emit("saved", saved, context);
    emit("update:modelValue", false);
  } catch (error) {
    const nextConflict = publicationConflictState(error, latest.revision);
    if (nextConflict) {
      const latestPublication = await store.latestPublication(basePublication.value.id, "screen");
      conflict.value = {...nextConflict, latestPublication};
      localError.value = "保存期间内容再次变化，已更新对比，请重新确认。";
    } else {
      localError.value = store.screenError;
    }
  } finally {
    conflictApplying.value = false;
  }
}

async function reloadLatest() {
  if (!basePublication.value || !conflict.value) return;
  if (!await confirmAction({
    title: "载入服务器最新版",
    message: "当前输入会被替换。需要保留时，可以先将其另存为一项新作业。",
    confirmText: "载入最新版",
    color: "warning",
  })) return;
  conflictReloading.value = true;
  localError.value = "";
  try {
    const latest = await store.latestPublication(basePublication.value.id, "screen");
    basePublication.value = latest;
    conflict.value = null;
    loadPublication(latest);
  } catch (error) {
    localError.value = error.response?.data?.message || error.message || "载入最新版失败";
  } finally {
    conflictReloading.value = false;
  }
}

async function saveConflictCopy() {
  if (!conflict.value) return;
  conflictCopying.value = true;
  localError.value = "";
  try {
    const savedContext = {
      subjectName: eligibleSubjects.value.find((subject) => subject.id === form.subjectId)?.name || "作业",
      targetName: eligibleTargets.value.find((workspace) => workspace.id === form.targetWorkspaceId)?.name || "目标班级",
      operation: "created",
    };
    const saved = await store.saveScreenPublication({
      subjectId: form.subjectId,
      targetWorkspaceIds: [form.targetWorkspaceId],
      title: form.title,
      content: form.content,
      boardDate: form.boardDate,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      priority: form.priority,
      publishAt: new Date().toISOString(),
      allowDuplicate: true,
    }, null, savedContext);
    clearScreenHomeworkDraft(store.screenSession?.binding?.id, basePublication.value?.id || "new");
    conflict.value = null;
    emit("saved", saved, savedContext);
    emit("update:modelValue", false);
  } catch {
    localError.value = store.screenError;
  } finally {
    conflictCopying.value = false;
  }
}
</script>

<style scoped>
.screen-composer {
  margin: 0 auto;
  max-width: 1120px;
  width: min(1120px, 100%);
}

.screen-composer__title,
.screen-composer__actions {
  background: rgb(var(--v-theme-surface));
  position: sticky;
  z-index: 2;
}

.screen-composer__title { top: 0; }
.screen-composer__actions {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  bottom: 0;
}

.screen-composer__body {
  padding-bottom: 20px;
}

.composer-section {
  margin-bottom: 20px;
}

.composer-section__label {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 10px;
}

.subject-choice-grid,
.target-choice-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.target-choice-grid {
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.target-choice__content {
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  text-align: left;
  width: 100%;
}

.target-choice__content small {
  font-size: 0.75rem;
  margin-top: 5px;
  opacity: 0.8;
}

.screen-content-input :deep(textarea) {
  font-size: 1.15rem;
  line-height: 1.6;
}

.screen-conflict-comparison {
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-warning), 0.35);
  border-radius: 12px;
}

.screen-conflict-comparison__row {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(100px, 0.5fr) minmax(0, 1fr) minmax(0, 1fr);
  padding: 10px 12px;
}

.screen-conflict-comparison__row + .screen-conflict-comparison__row {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.screen-conflict-comparison__row span { overflow-wrap: anywhere; white-space: pre-wrap; }

@media (max-width: 700px) {
  .screen-composer__actions > div:first-child { display: none; }
  .subject-choice-grid { grid-template-columns: repeat(3, 1fr); }
  .screen-conflict-comparison__row { grid-template-columns: 1fr; }
}
</style>
