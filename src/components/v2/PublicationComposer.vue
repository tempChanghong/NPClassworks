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
        v-model="form.content"
        auto-grow
        label="正文"
        placeholder="使用换行分条填写"
        rows="5"
        variant="outlined"
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
            hint="到达该时间后，通知会自动从学生端和大屏消失"
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
        :loading="saving"
        variant="tonal"
        @click="submit('DRAFT')"
      >
        保存草稿
      </v-btn>
      <v-btn
        :loading="publishing"
        color="primary"
        prepend-icon="mdi-send"
        variant="elevated"
        @click="submit('PUBLISHED')"
      >
        {{ isEditing && editingPublication.status === "PUBLISHED" ? "保存修改" : "正式发布" }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import {computed, reactive, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {todayBoardDate} from "@/utils/boardDate";
import {
  loadTeacherTargetPreferences,
  rememberTeacherTargets,
  teacherTargetCombinationId,
  toggleFavoriteTeacherTargets,
} from "@/utils/teacherTargetPreferences";

const props = defineProps({
  editingPublication: {
    type: Object,
    default: null,
  },
});
const emit = defineEmits(["published", "cancel"]);
const store = useClassworksV2Store();
const saving = ref(false);
const publishing = ref(false);
const localError = ref("");
const targetPreferencesRevision = ref(0);

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
const isEditing = computed(() => Boolean(props.editingPublication));
const targetPreferences = computed(() => {
  targetPreferencesRevision.value;
  return loadTeacherTargetPreferences(store.account?.id);
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

watch(() => props.editingPublication, (publication) => {
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
  toggleFavoriteTeacherTargets(store.account?.id, currentTargetCombination.value);
  targetPreferencesRevision.value += 1;
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

async function submit(status) {
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
  flag.value = true;
  try {
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
    };
    const publication = isEditing.value
      ? await store.updatePublication(props.editingPublication, input)
      : await store.publish(input);
    rememberTeacherTargets(store.account?.id, currentTargetCombination.value);
    targetPreferencesRevision.value += 1;
    reset();
    emit("published", publication);
  } catch {
    localError.value = store.teacherError;
  } finally {
    flag.value = false;
  }
}
</script>
