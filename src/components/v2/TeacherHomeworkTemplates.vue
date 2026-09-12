<template>
  <v-dialog
    :model-value="true"
    persistent
    scrollable
    :retain-focus="false"
    max-width="900"
    aria-label="个人作业模板"
  >
    <v-card class="homework-templates">
      <v-card-title>个人作业模板</v-card-title>
      <v-card-subtitle>跟随当前教师账号同步 · 标题、正文和常用物品</v-card-subtitle>
      <v-card-text>
        <v-alert
          v-if="error"
          type="error"
          class="mb-3"
        >
          {{ error }}
        </v-alert>
        <template v-if="mode === 'list'">
          <div class="d-flex flex-wrap ga-2 mb-3">
            <v-btn
              :disabled="busy"
              @click="edit()"
            >
              新建模板
            </v-btn>
            <v-btn
              :loading="busy"
              @click="load"
            >
              刷新模板
            </v-btn>
          </div>
          <p v-if="!busy && !items.length">
            暂无个人模板。可将当前标题、正文保存为模板。
          </p>
          <v-list>
            <v-list-item
              v-for="item in items"
              :key="item.id"
              :title="item.name"
              :subtitle="item.title || '无标题'"
              class="template-item"
            >
              <template #append>
                <v-btn
                  :disabled="busy"
                  @click="use(item)"
                >
                  填写使用
                </v-btn>
                <v-btn
                  :disabled="busy"
                  @click="edit(item)"
                >
                  编辑
                </v-btn>
                <v-btn
                  :disabled="busy"
                  color="error"
                  @click="remove(item)"
                >
                  删除
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
        </template>
        <template v-else-if="mode === 'edit'">
          <p class="mb-3">
            用〔页码〕、〔题号〕表示每次需要填写的内容。最多50个模板，每个最多10种填空项。
          </p>
          <v-text-field
            v-model="draft.name"
            :disabled="busy"
            label="模板名称"
            maxlength="60"
          />
          <v-text-field
            v-model="draft.title"
            :disabled="busy"
            label="模板标题"
            maxlength="191"
          />
          <v-textarea
            v-model="draft.content"
            :disabled="busy"
            label="模板正文"
            maxlength="6000"
            auto-grow
          />
          <v-textarea
            v-model="draft.materials"
            :disabled="busy"
            label="模板需带物品（可选）"
            maxlength="500"
            rows="2"
            hint="可使用填空项；模板不保存携带日期"
            persistent-hint
          />
          <v-btn
            :loading="busy"
            color="primary"
            @click="save"
          >
            保存模板
          </v-btn>
        </template>
        <template v-else>
          <h3 class="mb-3">
            {{ selected.name }}
          </h3>
          <v-text-field
            v-for="field in fields"
            :key="field"
            :model-value="values.get(field) || ''"
            :label="`填写：${field}`"
            maxlength="6000"
            @update:model-value="values.set(field, $event)"
          />
          <p
            v-if="previewError"
            class="text-medium-emphasis"
          >
            {{ previewError }}
          </p>
          <div
            v-else
            class="template-preview mb-4"
          >
            <h4>{{ preview.title }}</h4><p>{{ preview.content }}</p>
            <p v-if="preview.materials">
              需带：{{ preview.materials }}（套用后选择携带日期）
            </p>
          </div>
          <p class="mb-3">
            套用后请核对科目、班级、日期和截止时间，再保存或发布。
          </p>
          <v-btn
            :disabled="Boolean(previewError) || applying"
            color="primary"
            @click="emit('apply', preview)"
          >
            套用到编辑器
          </v-btn>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn
          v-if="mode !== 'list'"
          :disabled="busy || applying"
          @click="back"
        >
          返回模板列表
        </v-btn>
        <v-spacer />
        <v-btn
          :disabled="busy || applying"
          @click="close"
        >
          关闭模板
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup>
import {computed, onMounted, onUnmounted, reactive, ref} from "vue";
import {classworksV2Api} from "@/utils/classworksV2Client";
import {confirmAction} from "@/utils/actionDialog";
import {registerAppReloadBlocker} from "@/utils/appReloadProtection";
import {fillHomeworkTemplate, templateFields} from "@/utils/homeworkTemplates";

const props = defineProps({title: {type: String, default: ""}, content: {type: String, default: ""}, materials: {type: String, default: ""}, applying: Boolean});
const emit = defineEmits(["close", "apply"]);
const items = ref([]), busy = ref(false), error = ref(""), mode = ref("list"), selected = ref(null);
const draft = reactive({name: "", title: "", content: "", materials: ""}), values = reactive(new Map()), fields = ref([]);
let alive = true, clean = "";
const dirty = computed(() => mode.value === "edit" ? JSON.stringify(draft) !== clean : mode.value === "use" && [...values.values()].some(Boolean));
const previewError = computed(() => { try { fillHomeworkTemplate(selected.value || {}, values); return ""; } catch (e) { return e.message; } });
const preview = computed(() => previewError.value ? null : fillHomeworkTemplate(selected.value, values));
const release = registerAppReloadBlocker(() => busy.value || dirty.value ? "个人作业模板正在编辑或保存，请先完成后再刷新。" : "");
onUnmounted(() => { alive = false; release(); });
async function discard() {
  return !dirty.value || await confirmAction({title: "放弃模板输入？", message: "当前模板修改或填空内容尚未保存、套用。", confirmText: "放弃修改", color: "warning"});
}
async function close() { if (await discard() && alive) emit("close"); }
async function back() { if (await discard() && alive) { mode.value = "list"; error.value = ""; } }
async function run(operation) {
  if (busy.value) return;
  busy.value = true; error.value = "";
  try { await operation(); }
  catch (e) { if (alive) error.value = e.response?.data?.message || e.message || "操作失败，请重试。"; }
  finally { if (alive) busy.value = false; }
}
function load() { return run(async () => { const result = await classworksV2Api.homeworkTemplates(); if (alive) items.value = result; }); }
function edit(item = null) {
  selected.value = item;
  Object.assign(draft, {name: item?.name || "", title: item?.title ?? props.title, content: item?.content ?? props.content, materials: item ? item.materials || "" : props.materials});
  clean = JSON.stringify(draft); mode.value = "edit"; error.value = "";
}
function use(item) {
  try { fields.value = templateFields(item); selected.value = item; values.clear(); mode.value = "use"; error.value = ""; }
  catch (e) { error.value = e.message; }
}
function save() {
  return run(async () => {
    templateFields(draft);
    const result = selected.value
      ? await classworksV2Api.updateHomeworkTemplate(selected.value.id, {...draft, expectedRevision: selected.value.revision})
      : await classworksV2Api.createHomeworkTemplate({...draft});
    if (!alive) return;
    items.value = [...items.value.filter(item => item.id !== result.id), result];
    clean = JSON.stringify(draft); mode.value = "list";
  });
}
async function remove(item) {
  if (!await confirmAction({title: "删除个人模板？", message: `删除“${item.name}”不会修改已发布的作业。`, confirmText: "删除模板", color: "error"}) || !alive) return;
  await run(async () => {
    await classworksV2Api.deleteHomeworkTemplate(item.id, item.revision);
    if (alive) items.value = items.value.filter(row => row.id !== item.id);
  });
}
onMounted(load);
</script>
<style scoped>
.template-preview { white-space: pre-wrap; overflow-wrap: anywhere; }
.template-item :deep(.v-list-item__append) { flex-wrap: wrap; }
</style>
