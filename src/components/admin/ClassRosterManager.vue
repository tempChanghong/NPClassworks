<template>
  <v-card class="rounded-xl class-roster-manager">
    <v-card-title>班级学生名单</v-card-title>
    <v-card-text>
      <p class="mb-4">
        维护学生学号、姓名和顺序。名单变动不会删除历史考勤。
      </p>
      <v-alert
        v-if="error"
        type="error"
        class="mb-3"
      >
        {{ error }}
      </v-alert>
      <v-alert
        v-if="message"
        type="success"
        class="mb-3"
      >
        {{ message }}
      </v-alert>
      <v-row>
        <v-col
          cols="12"
          md="6"
        >
          <v-select
            :model-value="gradeId"
            :items="structure.grades"
            item-title="name"
            item-value="id"
            label="年级"
            :disabled="busy || loading"
            @update:model-value="chooseGrade"
          />
        </v-col>
        <v-col
          cols="12"
          md="6"
        >
          <v-select
            :model-value="classId"
            :items="classes"
            item-title="name"
            item-value="id"
            label="行政班"
            :disabled="busy || loading"
            @update:model-value="chooseClass"
          />
        </v-col>
      </v-row>
      <v-btn
        :disabled="busy || loading"
        variant="text"
        @click="reload"
      >
        重新载入
      </v-btn>
      <v-progress-linear
        v-if="loading"
        indeterminate
      />
      <template v-if="revision && !loading">
        <div class="d-flex ga-2 my-3">
          <v-btn
            :disabled="busy"
            @click="rows.push({name: '', studentNumber: ''})"
          >
            添加学生
          </v-btn>
          <v-btn
            :disabled="busy"
            @click="pasteOpen = !pasteOpen"
          >
            批量粘贴
          </v-btn>
          <span class="align-self-center">{{ rows.length }} / 120 人</span>
        </div>
        <div
          v-if="pasteOpen"
          class="mb-4"
        >
          <v-alert
            type="info"
            variant="tonal"
            class="mb-3"
          >
            从 Excel 复制“学号、姓名”两列，每行一人。相同学号保留学生身份；更改学号或无学号学生改名，请直接编辑下方表格。
          </v-alert>
          <v-select
            v-model="importMode"
            :items="[{title: '追加 / 更新（保留其他学生）', value: 'append'}, {title: '整班替换（未列出的学生将移出）', value: 'replace'}]"
            label="导入方式"
            :disabled="busy"
          />
          <v-textarea
            v-model="pasteText"
            label="粘贴名单"
            :disabled="busy"
            rows="5"
          />
          <v-btn
            :disabled="busy"
            @click="applyImport"
          >
            预览导入
          </v-btn>
        </div>
        <v-row
          v-for="(student, index) in rows"
          :key="student.id || `new-${index}`"
          class="roster-row"
          align="center"
        >
          <v-col cols="4">
            <v-text-field
              v-model="student.studentNumber"
              :label="`学号 ${index + 1}`"
              :disabled="busy"
              maxlength="64"
              hide-details
            />
          </v-col>
          <v-col cols="4">
            <v-text-field
              v-model="student.name"
              :label="`姓名 ${index + 1}`"
              :disabled="busy"
              maxlength="64"
              hide-details
            />
          </v-col>
          <v-col
            cols="4"
            class="d-flex flex-wrap"
          >
            <v-btn
              icon="mdi-arrow-up"
              size="small"
              variant="text"
              :aria-label="`上移第 ${index + 1} 人`"
              :disabled="busy || index === 0"
              @click="move(index, -1)"
            />
            <v-btn
              icon="mdi-arrow-down"
              size="small"
              variant="text"
              :aria-label="`下移第 ${index + 1} 人`"
              :disabled="busy || index === rows.length - 1"
              @click="move(index, 1)"
            />
            <v-btn
              icon="mdi-account-minus-outline"
              size="small"
              variant="text"
              :aria-label="`移出第 ${index + 1} 人`"
              :disabled="busy"
              @click="rows.splice(index, 1)"
            />
          </v-col>
        </v-row>
        <v-alert
          v-if="!rows.length"
          type="info"
          variant="tonal"
        >
          当前名单为空，可添加学生或批量粘贴。
        </v-alert>
        <v-btn
          color="primary"
          class="mt-5"
          :disabled="!dirty || busy"
          @click="previewSave"
        >
          预览并保存
        </v-btn>
      </template>
    </v-card-text>
    <v-dialog
      v-model="previewOpen"
      max-width="720"
      :persistent="busy"
    >
      <v-card title="核对名单变更">
        <v-card-text style="max-height: 60vh; overflow-y: auto">
          <p
            v-for="(change, index) in changes"
            :key="index"
            class="mb-2"
          >
            {{ change }}
          </p>
          <p>移出的学生会停用，历史考勤与学生记录仍保留。</p>
        </v-card-text>
        <v-card-actions>
          <v-btn
            :disabled="busy"
            @click="previewOpen = false"
          >
            返回修改
          </v-btn>
          <v-btn
            color="primary"
            :loading="busy"
            @click="save"
          >
            确认保存名单
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import {computed, onUnmounted, ref, watch} from "vue";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";
import {confirmAction} from "@/utils/actionDialog";
import {editableRoster, importRoster, rosterChanges, validateRoster} from "@/utils/classRoster";

const props = defineProps({schoolId: {type: String, required: true}, termId: {type: String, required: true}});
const emit = defineEmits(["dirty"]);
const structure = ref({grades: [], administrativeClasses: []});
const gradeId = ref(""), classId = ref(""), rows = ref([]), baseline = ref([]), revision = ref(null);
const loading = ref(false), busy = ref(false), error = ref(""), message = ref("");
const pasteOpen = ref(false), pasteText = ref(""), importMode = ref("append"), previewOpen = ref(false);
const changes = ref([]), submitted = ref([]);
let generation = 0;
const dirty = computed(() => JSON.stringify(rows.value) !== JSON.stringify(baseline.value) || Boolean(pasteText.value.trim()));
watch(dirty, value => emit("dirty", value), {immediate: true});
const classes = computed(() => structure.value.administrativeClasses.filter(c => c.gradeId === gradeId.value && c.isActive !== false));
const scope = () => `${props.schoolId}:${props.termId}:${classId.value}`;
const discard = () => !dirty.value || confirmAction({title: "放弃未保存的名单？", message: "可先复制保留当前输入。重新载入或切换班级会丢弃未保存修改。", confirmText: "放弃并继续", color: "warning"});
function reset() { rows.value = []; baseline.value = []; revision.value = null; pasteText.value = ""; previewOpen.value = false; }
async function loadStructure() {
  const request = ++generation;
  reset(); classId.value = ""; gradeId.value = ""; structure.value = {grades: [], administrativeClasses: []};
  loading.value = true; error.value = ""; message.value = "";
  try {
    const result = await classworksV2Api.managedAcademicStructure(props.schoolId, props.termId);
    if (request !== generation) return;
    structure.value = result; gradeId.value = result.grades[0]?.id || "";
    classId.value = classes.value[0]?.id || "";
    await loadRoster();
  } catch (e) { if (request === generation) error.value = describeApiError(e, "加载班级失败"); }
  finally { if (request === generation) loading.value = false; }
}
async function loadRoster() {
  const request = ++generation, initialScope = scope();
  reset(); error.value = ""; message.value = ""; loading.value = true;
  try {
    if (!classId.value) return;
    const result = await classworksV2Api.managedClassRoster(props.schoolId, classId.value);
    if (request !== generation || initialScope !== scope()) return;
    baseline.value = editableRoster(result.students); rows.value = editableRoster(result.students); revision.value = result.revision;
  } catch (e) { if (request === generation) error.value = describeApiError(e, "读取名单失败，请重试"); }
  finally { if (request === generation) loading.value = false; }
}
async function chooseGrade(value) { if (!await discard()) return; gradeId.value = value; classId.value = classes.value[0]?.id || ""; await loadRoster(); }
async function chooseClass(value) { if (!await discard()) return; classId.value = value; await loadRoster(); }
async function reload() { if (await discard()) { if (classId.value) await loadRoster(); else await loadStructure(); } }
function move(index, delta) { const [row] = rows.value.splice(index, 1); rows.value.splice(index + delta, 0, row); }
function applyImport() {
  try { rows.value = importRoster(pasteText.value, rows.value, importMode.value); pasteText.value = ""; error.value = ""; previewSave(); }
  catch (e) { error.value = e.message; }
}
function previewSave() {
  try {
    if (pasteText.value.trim()) throw new Error("请先预览导入，或清空尚未处理的粘贴内容");
    submitted.value = validateRoster(rows.value); changes.value = rosterChanges(baseline.value, submitted.value);
    if (!changes.value.length) throw new Error("名单没有变化");
    error.value = ""; previewOpen.value = true;
  } catch (e) { error.value = e.message; }
}
async function save() {
  if (busy.value) return;
  const initialScope = scope(), request = generation;
  busy.value = true; error.value = "";
  try {
    const result = await classworksV2Api.saveManagedClassRoster(props.schoolId, classId.value, submitted.value, revision.value);
    if (request !== generation || initialScope !== scope()) return;
    baseline.value = editableRoster(result.students); rows.value = editableRoster(result.students); revision.value = result.revision;
    message.value = "名单已保存，在线大屏将同步更新。";
  } catch (e) { if (request === generation) error.value = describeApiError(e, "保存失败，输入已保留"); }
  finally { busy.value = false; if (request === generation) previewOpen.value = false; }
}
watch(() => [props.schoolId, props.termId], loadStructure, {immediate: true});
onUnmounted(() => { generation++; emit("dirty", false); });
</script>
