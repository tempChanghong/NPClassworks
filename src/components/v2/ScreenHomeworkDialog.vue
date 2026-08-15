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
        </section>

        <section class="composer-section">
          <div class="composer-section__label">
            截止时间
          </div>
          <div class="d-flex align-center flex-wrap ga-2">
            <v-btn
              variant="tonal"
              @click="setTomorrowDue(7, 30)"
            >
              明早 7:30
            </v-btn>
            <v-btn
              variant="tonal"
              @click="setTomorrowDue(12, 0)"
            >
              明天 12:00
            </v-btn>
            <v-btn
              variant="tonal"
              @click="setTomorrowDue(18, 0)"
            >
              明晚 18:00
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
          :disabled="!canSave"
          :loading="saving"
          min-width="180"
          prepend-icon="mdi-content-save-outline"
          size="x-large"
          @click="save"
        >
          保存作业
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup>
import {computed, reactive, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {todayBoardDate} from "@/utils/boardDate";

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
const advancedPanel = ref();
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
const canSave = computed(() => Boolean(
  form.subjectId &&
  form.targetWorkspaceId &&
  (form.title.trim() || form.content.trim()),
));
const dueAtLabel = computed(() => form.dueAt
  ? new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(form.dueAt))
  : "");

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
  advancedPanel.value = publication ? "advanced" : undefined;
  form.subjectId = publication?.subjectId || "";
  form.targetWorkspaceId = publication?.targets?.[0]?.workspaceId || "";
  form.title = publication?.title || "";
  form.content = publication?.content || "";
  form.boardDate = publication?.boardDate
    ? String(publication.boardDate).slice(0, 10)
    : store.boardDate;
  form.dueAt = localDateTime(publication?.dueAt);
  form.priority = publication?.priority || "NORMAL";
}

function targetSubtitle(workspace) {
  if (workspace.type === "ADMIN_CLASS") return "本行政班 · 随班科目";
  const sources = workspace.sourceClasses
    ?.map((item) => item.administrativeClass?.name)
    .filter(Boolean)
    .join("、");
  return sources ? `走班教学班 · 涉及 ${sources}` : "相关走班教学班";
}

function setTomorrowDue(hour, minute) {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(hour, minute, 0, 0);
  form.dueAt = localDateTime(value);
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
      boardDate: form.boardDate,
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

@media (max-width: 700px) {
  .screen-composer__actions > div:first-child { display: none; }
  .subject-choice-grid { grid-template-columns: repeat(3, 1fr); }
}
</style>
