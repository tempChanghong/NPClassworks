<template>
  <v-dialog
    :model-value="modelValue"
    max-width="760"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center pa-5 pb-2">
        <v-icon
          class="mr-3"
          color="primary"
          icon="mdi-monitor-edit"
        />
        {{ publication ? "修改作业" : "大屏录入作业" }}
      </v-card-title>
      <v-card-text class="px-5">
        <v-alert
          class="mb-5"
          type="info"
          variant="tonal"
        >
          每次保存都会产生不可覆盖的历史版本。大屏保存的内容默认为“待教师确认”。
        </v-alert>

        <v-select
          v-model="form.subjectId"
          :items="eligibleSubjects"
          item-title="name"
          item-value="id"
          label="科目"
          variant="outlined"
        />
        <v-autocomplete
          v-model="form.targetWorkspaceId"
          :disabled="!form.subjectId"
          :items="eligibleTargets"
          item-title="name"
          item-value="id"
          label="行政班或走班教学班"
          variant="outlined"
        >
          <template #item="{props: itemProps, item}">
            <v-list-item
              v-bind="itemProps"
              :subtitle="targetSubtitle(item.raw)"
              :title="item.raw.name"
            />
          </template>
        </v-autocomplete>
        <v-text-field
          v-model="form.title"
          label="标题（可选）"
          variant="outlined"
        />
        <v-textarea
          v-model="form.content"
          auto-grow
          label="作业内容"
          :placeholder="contentFocused ? '例如：完成练习册第 10～12 页' : ''"
          rows="5"
          variant="outlined"
          @blur="contentFocused = false"
          @focus="contentFocused = true"
        />
        <v-row>
          <v-col
            cols="12"
            md="6"
          >
            <v-text-field
              v-model="form.dueAt"
              label="截止时间（可选）"
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
        <v-alert
          v-if="localError || store.screenError"
          class="mt-2"
          type="error"
          variant="tonal"
        >
          {{ localError || store.screenError }}
        </v-alert>
      </v-card-text>
      <v-card-actions class="px-5 pb-5">
        <v-spacer />
        <v-btn @click="$emit('update:modelValue', false)">
          取消
        </v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          prepend-icon="mdi-content-save-outline"
          @click="save"
        >
          保存新版本
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, reactive, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";

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
const contentFocused = ref(false);
const form = reactive({
  subjectId: "",
  targetWorkspaceId: "",
  title: "",
  content: "",
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

watch(() => props.publication, loadPublication, {immediate: true});
watch(() => props.modelValue, (open) => {
  if (open) loadPublication(props.publication);
});
watch(() => form.subjectId, () => {
  if (!eligibleTargets.value.some((workspace) => workspace.id === form.targetWorkspaceId)) {
    form.targetWorkspaceId = eligibleTargets.value.length === 1 ? eligibleTargets.value[0].id : "";
  }
});

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function loadPublication(publication) {
  localError.value = "";
  form.subjectId = publication?.subjectId || "";
  form.targetWorkspaceId = publication?.targets?.[0]?.workspaceId || "";
  form.title = publication?.title || "";
  form.content = publication?.content || "";
  form.dueAt = localDateTime(publication?.dueAt);
  form.priority = publication?.priority || "NORMAL";
}

function targetSubtitle(workspace) {
  if (workspace.type === "ADMIN_CLASS") return "本行政班 · 随班科目";
  const sources = workspace.sourceClasses?.map((item) => item.administrativeClass.name).join("、");
  return sources ? `走班教学班 · 涉及 ${sources}` : "走班教学班";
}

async function save() {
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
    const saved = await store.saveScreenPublication({
      subjectId: form.subjectId,
      targetWorkspaceIds: [form.targetWorkspaceId],
      title: form.title,
      content: form.content,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      priority: form.priority,
      publishAt: props.publication?.publishAt || new Date().toISOString(),
    }, props.publication);
    emit("saved", saved);
    emit("update:modelValue", false);
  } catch {
    // Store exposes the server's conflict/permission message.
  } finally {
    saving.value = false;
  }
}
</script>
