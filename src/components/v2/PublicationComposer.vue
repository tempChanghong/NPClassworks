<template>
  <v-card
    class="rounded-xl"
    variant="flat"
  >
    <v-card-title class="d-flex align-center pa-5">
      <v-icon
        class="mr-3"
        color="primary"
        icon="mdi-pencil-box-multiple-outline"
      />
      {{ isEditing ? "编辑发布" : "新建发布" }}
    </v-card-title>
    <v-card-text class="px-5">
      <v-alert
        v-if="isEditing && confirmAfterSave"
        class="mb-5"
        color="success"
        icon="mdi-pencil-check-outline"
        variant="tonal"
      >
        保存修改后，系统将立即确认刚保存的新版本。
      </v-alert>
      <v-btn-toggle
        v-model="form.type"
        class="mb-5"
        color="primary"
        mandatory
        variant="outlined"
      >
        <v-btn
          value="ASSIGNMENT"
          prepend-icon="mdi-book-open-page-variant"
        >
          作业
        </v-btn>
        <v-btn
          value="NOTICE"
          prepend-icon="mdi-bullhorn-outline"
        >
          通知
        </v-btn>
      </v-btn-toggle>

      <v-select
        v-if="form.type === 'ASSIGNMENT'"
        v-model="form.subjectId"
        :items="store.teacherSubjects"
        item-title="name"
        item-value="id"
        label="科目"
        variant="outlined"
      />

      <v-autocomplete
        v-model="form.targetWorkspaceIds"
        :disabled="form.type === 'ASSIGNMENT' && !form.subjectId"
        :items="eligibleTargets"
        chips
        closable-chips
        item-title="name"
        item-value="id"
        label="发布到"
        multiple
        variant="outlined"
      >
        <template #item="{props: itemProps, item}">
          <v-list-item
            v-bind="itemProps"
            :subtitle="targetSubtitle(item.raw)"
            :title="item.raw.name"
          />
        </template>
        <template #chip="{props: chipProps, item}">
          <v-chip v-bind="chipProps">
            {{ item.raw.name }}
          </v-chip>
        </template>
      </v-autocomplete>

      <div
        v-if="targetShortcuts.length"
        class="mb-4"
      >
        <div class="text-caption text-medium-emphasis mb-2">
          常用与最近目标
        </div>
        <div class="d-flex flex-wrap ga-2">
          <v-chip
            v-for="shortcut in targetShortcuts"
            :key="shortcut.id"
            :prepend-icon="shortcut.favorite ? 'mdi-star' : 'mdi-history'"
            :color="shortcut.favorite ? 'warning' : undefined"
            variant="tonal"
            @click="applyTargetShortcut(shortcut)"
          >
            {{ shortcut.label }}
          </v-chip>
        </div>
      </div>

      <v-btn
        class="mb-4"
        :disabled="!form.targetWorkspaceIds.length"
        :prepend-icon="currentTargetsFavorite ? 'mdi-star' : 'mdi-star-outline'"
        size="small"
        variant="text"
        @click="toggleCurrentTargetsFavorite"
      >
        {{ currentTargetsFavorite ? "取消收藏当前目标" : "收藏当前目标组合" }}
      </v-btn>

      <v-alert
        class="mb-4"
        color="info"
        variant="tonal"
      >
        作业目标已按授课规则过滤：一、二班小科可选行政班，走班科目只显示对应教学班。
      </v-alert>

      <v-text-field
        v-if="form.type === 'ASSIGNMENT'"
        v-model="form.boardDate"
        hint="决定这项作业出现在哪一天的作业板上，与定时发布时间相互独立"
        label="作业板日期"
        persistent-hint
        type="date"
        variant="outlined"
      />

      <v-text-field
        v-model="form.title"
        label="标题（可选）"
        variant="outlined"
      />
      <v-textarea
        ref="contentInput"
        v-model="form.content"
        auto-grow
        label="正文"
        placeholder="使用换行分条填写"
        rows="5"
        variant="outlined"
      />
      <HomeworkQuickInputBar
        v-if="form.type === 'ASSIGNMENT'"
        density="teacher"
        :items="quickInputs"
        :subject-id="form.subjectId"
        @insert="insertQuickInput"
      />

      <v-row>
        <v-col
          cols="12"
          md="4"
        >
          <v-text-field
            v-model="form.publishAt"
            label="发布时间"
            type="datetime-local"
            variant="outlined"
          />
        </v-col>
        <v-col
          cols="12"
          md="4"
        >
          <v-text-field
            v-if="form.type === 'ASSIGNMENT'"
            v-model="form.dueAt"
            label="截止时间（可选）"
            type="datetime-local"
            variant="outlined"
          />
          <v-text-field
            v-else
            v-model="form.expiresAt"
            hint="留空时默认在发布三天后的同一时间自动消失"
            label="自动失效时间（可选）"
            persistent-hint
            type="datetime-local"
            variant="outlined"
          />
        </v-col>
        <v-col
          cols="12"
          md="4"
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

      <v-card
        class="publication-preview mb-4"
        color="primary"
        variant="tonal"
      >
        <v-card-title class="d-flex align-center text-subtitle-1 font-weight-bold pb-1">
          <v-icon
            class="mr-2"
            icon="mdi-eye-outline"
          />
          发布目标预览
        </v-card-title>
        <v-card-text class="pt-2">
          <div class="d-flex flex-wrap ga-2 mb-3">
            <v-chip
              :prepend-icon="form.type === 'ASSIGNMENT' ? 'mdi-book-open-page-variant' : 'mdi-bullhorn-outline'"
              size="small"
              variant="flat"
            >
              {{ form.type === "ASSIGNMENT" ? (selectedSubject?.name || "未选择科目") : "通知" }}
            </v-chip>
            <v-chip
              :color="priorityPreview.color"
              size="small"
              variant="tonal"
            >
              {{ priorityPreview.label }}
            </v-chip>
            <v-chip
              prepend-icon="mdi-clock-outline"
              size="small"
              variant="tonal"
            >
              {{ publishTimePreview }}
            </v-chip>
          </div>
          <div
            v-if="selectedTargets.length"
            class="mb-2"
          >
            <div class="font-weight-bold mb-2">
              将发布到 {{ selectedTargets.length }} 个班级/教学班
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-chip
                v-for="target in selectedTargets"
                :key="target.id"
                :prepend-icon="target.type === 'ADMIN_CLASS' ? 'mdi-home-group' : 'mdi-account-group-outline'"
                size="small"
                variant="outlined"
              >
                {{ target.name }} · {{ target.type === "ADMIN_CLASS" ? "行政班" : "走班" }}
              </v-chip>
            </div>
          </div>
          <v-alert
            v-else
            density="compact"
            type="warning"
            variant="tonal"
          >
            尚未选择发布目标，正式发布前需要至少选择一个班级。
          </v-alert>
          <div class="text-caption text-medium-emphasis mt-3">
            {{ lifecyclePreview }}
          </div>
        </v-card-text>
      </v-card>

      <v-alert
        v-if="duplicateWarning"
        class="mb-3"
        color="warning"
        icon="mdi-content-duplicate"
        title="这项作业可能已经发布过"
        variant="tonal"
      >
        <div>{{ duplicateWarning.message }}。系统没有保存本次内容。</div>
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
            size="small"
            variant="text"
            @click="duplicateWarning = null"
          >
            返回修改
          </v-btn>
          <v-btn
            :loading="duplicateStatus === 'DRAFT' ? saving : publishing"
            prepend-icon="mdi-send-check-outline"
            size="small"
            variant="flat"
            @click="submit(duplicateStatus, true)"
          >
            确认仍然{{ duplicateStatus === "DRAFT" ? "保存" : "发布" }}
          </v-btn>
        </div>
      </v-alert>

      <v-alert
        v-if="conflict"
        class="mb-3"
        color="warning"
        icon="mdi-source-branch-sync"
        title="内容已在其他设备更新"
        variant="tonal"
      >
        <div>{{ conflictMessage }}</div>
        <div
          v-if="publicationConflictRows.length"
          class="conflict-comparison mt-3"
        >
          <div class="conflict-comparison__header">
            <strong>发生差异的字段</strong>
            <span>服务器最新版 / 我的输入</span>
          </div>
          <div
            v-for="row in publicationConflictRows"
            :key="row.key"
            class="conflict-comparison__row"
          >
            <div class="font-weight-bold">
              {{ row.label }}
            </div>
            <div class="conflict-comparison__server">
              服务器：{{ conflictValue(row, "currentValue") }}
            </div>
            <div class="conflict-comparison__local">
              我的：{{ conflictValue(row, "localValue") }}
            </div>
          </div>
        </div>
        <div class="d-flex flex-wrap ga-2 mt-3">
          <v-btn
            :loading="conflictReloading"
            prepend-icon="mdi-cloud-download-outline"
            size="small"
            variant="flat"
            @click="reloadLatest"
          >
            放弃本机输入并载入最新版
          </v-btn>
          <v-btn
            v-if="conflict.latestPublication"
            :loading="conflictApplying"
            prepend-icon="mdi-source-merge"
            size="small"
            variant="tonal"
            @click="applyLocalOnLatest"
          >
            以我的输入生成新版本
          </v-btn>
          <v-btn
            :loading="conflictCopying"
            prepend-icon="mdi-content-copy"
            size="small"
            variant="tonal"
            @click="saveConflictCopy"
          >
            将本机输入另存为草稿
          </v-btn>
        </div>
      </v-alert>

      <v-alert
        v-if="localError"
        class="mb-3"
        type="error"
        variant="tonal"
      >
        {{ localError }}
      </v-alert>
    </v-card-text>

    <v-card-actions class="pa-5 pt-0">
      <v-btn
        v-if="isEditing"
        variant="text"
        @click="$emit('cancel')"
      >
        取消编辑
      </v-btn>
      <v-spacer />
      <v-btn
        v-if="!isEditing || editingPublication.status === 'DRAFT'"
        :disabled="Boolean(conflict || duplicateWarning)"
        :loading="saving"
        variant="tonal"
        @click="submit('DRAFT')"
      >
        保存草稿
      </v-btn>
      <v-btn
        :disabled="Boolean(conflict || duplicateWarning)"
        :loading="publishing"
        color="primary"
        prepend-icon="mdi-send"
        variant="elevated"
        @click="submit('PUBLISHED')"
      >
        {{ publishButtonLabel }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import {computed, nextTick, reactive, ref, watch} from "vue";
import HomeworkQuickInputBar from "@/components/v2/HomeworkQuickInputBar.vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {todayBoardDate} from "@/utils/boardDate";
import {
  teacherTargetCombinationId,
} from "@/utils/teacherTargetPreferences";
import {insertHomeworkQuickInput, sanitizeHomeworkQuickInputs} from "@/utils/homeworkQuickInputs";
import {buildConflictComparison, PUBLICATION_CONFLICT_FIELDS} from "@/utils/conflictComparison";
import {publicationPriorityMeta} from "@/utils/publicationStatus";
import {
  publicationConflictMessage,
  publicationConflictState,
} from "@/utils/publicationConflict";
import {
  duplicateAssignmentDescription,
  publicationDuplicateState,
} from "@/utils/publicationDuplicate";

const props = defineProps({
  editingPublication: {
    type: Object,
    default: null,
  },
  confirmAfterSave: Boolean,
});
const emit = defineEmits(["published", "cancel", "reload-latest"]);
const store = useClassworksV2Store();
const saving = ref(false);
const publishing = ref(false);
const localError = ref("");
const conflict = ref(null);
const conflictInput = ref(null);
const conflictReloading = ref(false);
const conflictCopying = ref(false);
const conflictApplying = ref(false);
const duplicateWarning = ref(null);
const duplicateStatus = ref("PUBLISHED");
const contentInput = ref(null);

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatPreviewDateTime(date) {
  if (Number.isNaN(date.getTime())) return "时间未填写";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const form = reactive({
  type: "ASSIGNMENT",
  subjectId: "",
  targetWorkspaceIds: [],
  title: "",
  content: "",
  boardDate: todayBoardDate(),
  publishAt: localDateTime(),
  dueAt: "",
  expiresAt: "",
  priority: "NORMAL",
});

const priorities = [
  {title: "普通", value: "NORMAL"},
  {title: "重要", value: "IMPORTANT"},
  {title: "紧急", value: "URGENT"},
];

const eligibleTargets = computed(() =>
  store.eligibleTeacherWorkspaces(form.type, form.subjectId),
);
const selectedTargets = computed(() => {
  const byId = new Map(eligibleTargets.value.map((workspace) => [workspace.id, workspace]));
  return form.targetWorkspaceIds.map((id) => byId.get(id)).filter(Boolean);
});
const selectedSubject = computed(() => store.teacherSubjects.find((item) => item.id === form.subjectId));
const priorityPreview = computed(() => publicationPriorityMeta(form.priority));
const publishTimePreview = computed(() => {
  const time = new Date(form.publishAt);
  if (Number.isNaN(time.getTime())) return "发布时间未填写";
  return time.getTime() <= Date.now() + 60_000
    ? "发布后立即显示"
    : `${formatPreviewDateTime(time)}开始显示`;
});
const lifecyclePreview = computed(() => {
  if (form.type === "ASSIGNMENT") {
    const board = form.boardDate ? `显示在 ${form.boardDate} 作业板` : "未选择作业板日期";
    return form.dueAt
      ? `${board}，截止 ${formatPreviewDateTime(new Date(form.dueAt))}`
      : `${board}，未设置截止时间`;
  }
  if (form.expiresAt) {
    return `通知将在 ${formatPreviewDateTime(new Date(form.expiresAt))} 自动停止显示`;
  }
  const publishAt = new Date(form.publishAt);
  if (Number.isNaN(publishAt.getTime())) return "填写发布时间后，将默认显示三天";
  const defaultExpiry = new Date(publishAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  return `未指定失效时间，将在 ${formatPreviewDateTime(defaultExpiry)} 自动停止显示`;
});
const isEditing = computed(() => Boolean(props.editingPublication));
const publishButtonLabel = computed(() => {
  if (isEditing.value && props.confirmAfterSave) return "保存修改并确认";
  if (isEditing.value && props.editingPublication.status === "PUBLISHED") return "保存修改";
  return "正式发布";
});
const conflictMessage = computed(() => publicationConflictMessage(conflict.value));
const publicationConflictRows = computed(() => buildConflictComparison(
  conflictInput.value,
  conflict.value?.latestPublication,
  PUBLICATION_CONFLICT_FIELDS,
));
const targetPreferences = computed(() => store.teacherTargetPreferences);
const quickInputs = computed(() => {
  const subject = store.teacherSubjects.find((item) => item.id === form.subjectId);
  return sanitizeHomeworkQuickInputs(store.teacherHomeworkSettingsBySchool[subject?.schoolId]?.quickInputs);
});
const currentTargetCombination = computed(() => ({
  type: form.type,
  subjectId: form.type === "ASSIGNMENT" ? form.subjectId : null,
  targetWorkspaceIds: form.targetWorkspaceIds,
}));
const currentTargetsFavorite = computed(() => {
  const id = teacherTargetCombinationId(currentTargetCombination.value);
  return Boolean(id && targetPreferences.value.favorites.some(
    (item) => teacherTargetCombinationId(item) === id,
  ));
});
const targetShortcuts = computed(() => {
  const allowed = new Map(eligibleTargets.value.map((workspace) => [workspace.id, workspace]));
  const favorites = new Set(targetPreferences.value.favorites.map(teacherTargetCombinationId));
  const combined = [...targetPreferences.value.favorites, ...targetPreferences.value.recent];
  const seen = new Set();
  return combined.filter((item) => {
    const id = teacherTargetCombinationId(item);
    if (seen.has(id) || item.type !== form.type || item.subjectId !== (form.subjectId || null)) return false;
    if (!item.targetWorkspaceIds.every((workspaceId) => allowed.has(workspaceId))) return false;
    seen.add(id);
    return true;
  }).map((item) => ({
    ...item,
    id: teacherTargetCombinationId(item),
    favorite: favorites.has(teacherTargetCombinationId(item)),
    label: item.targetWorkspaceIds.map((id) => allowed.get(id)?.name).filter(Boolean).join("＋"),
  }));
});

watch([() => form.type, () => form.subjectId], () => {
  const allowed = new Set(eligibleTargets.value.map((item) => item.id));
  form.targetWorkspaceIds = form.targetWorkspaceIds.filter((id) => allowed.has(id));
  if (form.type === "NOTICE") form.subjectId = "";
});
watch(form, () => {
  duplicateWarning.value = null;
}, {deep: true});

watch(() => props.editingPublication, (publication) => {
  conflict.value = null;
  duplicateWarning.value = null;
  conflictInput.value = null;
  localError.value = "";
  if (!publication) {
    reset();
    return;
  }
  form.type = publication.type;
  form.subjectId = publication.subjectId || "";
  form.targetWorkspaceIds = publication.targets?.map((target) => target.workspaceId) || [];
  form.title = publication.title || "";
  form.content = publication.content || "";
  form.boardDate = publication.boardDate
    ? String(publication.boardDate).slice(0, 10)
    : todayBoardDate(new Date(publication.publishAt));
  form.publishAt = localDateTime(new Date(publication.publishAt));
  form.dueAt = publication.dueAt ? localDateTime(new Date(publication.dueAt)) : "";
  form.expiresAt = publication.expiresAt ? localDateTime(new Date(publication.expiresAt)) : "";
  form.priority = publication.priority;
}, {immediate: true});

function targetSubtitle(workspace) {
  const kind = workspace.type === "ADMIN_CLASS" ? "行政班" : "走班教学班";
  return `${kind} · ${workspace.term?.school?.name || ""}`;
}

function applyTargetShortcut(shortcut) {
  form.targetWorkspaceIds = [...shortcut.targetWorkspaceIds];
}

function toggleCurrentTargetsFavorite() {
  store.toggleTeacherTargetFavorite(currentTargetCombination.value);
}

async function insertQuickInput(item) {
  const textarea = contentInput.value?.$el?.querySelector("textarea");
  const result = insertHomeworkQuickInput(
    form.content,
    textarea?.selectionStart,
    textarea?.selectionEnd,
    item,
  );
  form.content = result.value;
  await nextTick();
  const nextTextarea = contentInput.value?.$el?.querySelector("textarea");
  nextTextarea?.focus();
  nextTextarea?.setSelectionRange(result.cursor, result.cursor);
}

function reset() {
  form.targetWorkspaceIds = [];
  form.title = "";
  form.content = "";
  form.boardDate = todayBoardDate();
  form.dueAt = "";
  form.expiresAt = "";
  form.publishAt = localDateTime();
}

async function submit(status, allowDuplicate = false) {
  localError.value = "";
  if (form.type === "ASSIGNMENT" && !form.subjectId) {
    localError.value = "作业必须选择科目";
    return;
  }
  if (!form.targetWorkspaceIds.length) {
    localError.value = "请至少选择一个发布目标";
    return;
  }
  if (status === "PUBLISHED" && !form.title.trim() && !form.content.trim()) {
    localError.value = "标题和正文不能同时为空";
    return;
  }
  const flag = status === "DRAFT" ? saving : publishing;
  let submittedInput = null;
  flag.value = true;
  try {
    const operation = isEditing.value ? "updated" : "created";
    const input = {
      type: form.type,
      subjectId: form.type === "ASSIGNMENT" ? form.subjectId : null,
      targetWorkspaceIds: form.targetWorkspaceIds,
      title: form.title,
      content: form.content,
      boardDate: form.type === "ASSIGNMENT" ? form.boardDate : null,
      publishAt: new Date(form.publishAt).toISOString(),
      dueAt: form.type === "ASSIGNMENT" && form.dueAt ? new Date(form.dueAt).toISOString() : null,
      expiresAt: form.type === "NOTICE" && form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      priority: form.priority,
      status,
      ...(allowDuplicate ? {allowDuplicate: true} : {}),
    };
    submittedInput = input;
    const publication = isEditing.value
      ? await store.updatePublication(props.editingPublication, input)
      : await store.publish(input);
    store.rememberTeacherTargetCombination(currentTargetCombination.value);
    reset();
    emit("published", publication, {operation});
  } catch (error) {
    const duplicate = publicationDuplicateState(error);
    if (duplicate) {
      duplicateWarning.value = duplicate;
      duplicateStatus.value = status;
      conflict.value = null;
      localError.value = "";
      store.teacherError = "";
      return;
    }
    const nextConflict = publicationConflictState(error, props.editingPublication?.revision);
    if (nextConflict) {
      conflictInput.value = submittedInput;
      localError.value = "";
      try {
        const latestPublication = await store.latestPublication(props.editingPublication.id, "teacher");
        conflict.value = {...nextConflict, latestPublication};
        store.teacherError = "";
      } catch {
        conflict.value = nextConflict;
      }
    } else {
      localError.value = store.teacherError;
    }
  } finally {
    flag.value = false;
  }
}

function conflictValue(row, key) {
  const value = row[key];
  if (row.key === "subjectId") {
    return store.teacherSubjects.find((item) => item.id === value)?.name || value;
  }
  if (row.key === "targetWorkspaceIds") {
    const names = String(value).split("、").map((id) =>
      store.teacherWorkspaces.find((item) => item.id === id)?.name || id);
    return names.join("、");
  }
  if (row.key === "priority") return publicationPriorityMeta(value).label;
  return value;
}

async function applyLocalOnLatest() {
  if (!conflict.value?.latestPublication || !conflictInput.value) return;
  if (!window.confirm("系统会保留服务器当前版本，并把你的输入保存为下一个新版本。确认继续吗？")) return;
  conflictApplying.value = true;
  localError.value = "";
  try {
    const updated = await store.updatePublication(conflict.value.latestPublication, conflictInput.value);
    reset();
    conflict.value = null;
    conflictInput.value = null;
    emit("published", updated, {operation: "updated", conflictResolved: true});
  } catch (error) {
    const nextConflict = publicationConflictState(error, conflict.value.latestPublication.revision);
    if (nextConflict) {
      const latestPublication = await store.latestPublication(props.editingPublication.id, "teacher");
      conflict.value = {...nextConflict, latestPublication};
      localError.value = "保存期间内容再次发生变化，已更新对比，请重新确认。";
    } else {
      localError.value = store.teacherError;
    }
  } finally {
    conflictApplying.value = false;
  }
}

async function reloadLatest() {
  if (!props.editingPublication || !conflict.value) return;
  if (!window.confirm("载入服务器最新版会放弃当前表单输入。若需要保留，请先另存为草稿。")) return;
  conflictReloading.value = true;
  try {
    const latest = await store.latestPublication(props.editingPublication.id, "teacher");
    emit("reload-latest", latest);
  } catch (error) {
    localError.value = error.response?.data?.message || error.message || "载入最新版失败";
  } finally {
    conflictReloading.value = false;
  }
}

async function saveConflictCopy() {
  if (!conflictInput.value) return;
  conflictCopying.value = true;
  localError.value = "";
  try {
    const copied = await store.publish({...conflictInput.value, status: "DRAFT"});
    reset();
    conflict.value = null;
    conflictInput.value = null;
    emit("published", copied, {operation: "created"});
  } catch {
    localError.value = store.teacherError;
  } finally {
    conflictCopying.value = false;
  }
}
</script>

<style scoped>
.conflict-comparison {
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-warning), 0.35);
  border-radius: 12px;
}
.conflict-comparison__header,
.conflict-comparison__row {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(100px, 0.55fr) minmax(0, 1fr) minmax(0, 1fr);
  padding: 10px 12px;
}
.conflict-comparison__header {
  background: rgba(var(--v-theme-warning), 0.12);
}
.conflict-comparison__header span { grid-column: 2 / 4; }
.conflict-comparison__row + .conflict-comparison__row { border-top: 1px solid rgba(var(--v-border-color), 0.2); }
.conflict-comparison__server,
.conflict-comparison__local { overflow-wrap: anywhere; white-space: pre-wrap; }
.conflict-comparison__server { color: rgb(var(--v-theme-info)); }
.conflict-comparison__local { color: rgb(var(--v-theme-success)); }
@media (max-width: 600px) {
  .conflict-comparison__header,
  .conflict-comparison__row { grid-template-columns: 1fr; }
  .conflict-comparison__header span { grid-column: auto; }
}
</style>
