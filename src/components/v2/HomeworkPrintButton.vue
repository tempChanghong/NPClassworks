<template>
  <v-btn
    v-if="!hideButton"
    :disabled="disabled"
    prepend-icon="mdi-printer-outline"
    variant="tonal"
    @click="openPreview"
  >
    打印作业清单
  </v-btn>
  <v-btn
    v-if="!hideButton"
    :disabled="disabled"
    prepend-icon="mdi-content-copy"
    variant="tonal"
    @click="openPreview('text')"
  >
    复制文字清单
  </v-btn>
  <v-dialog
    v-model="opened"
    max-width="900"
    scrollable
  >
    <v-card class="homework-print-dialog rounded-xl">
      <v-card-title>作业清单预览</v-card-title>
      <v-card-text>
        <p class="mb-3 text-body-2">
          预览当前班级与日期的已加载作业，可复制文字、生成图片或打印。内容以本次打开时为准；保存 PDF 请在系统打印窗口选择“另存为 PDF”。
        </p>
        <v-btn-toggle
          v-model="mode"
          mandatory
          color="primary"
          class="mb-4"
        >
          <v-btn value="print">
            打印 / 图片
          </v-btn>
          <v-btn value="text">
            文字清单
          </v-btn>
        </v-btn-toggle>
        <v-alert
          v-if="error"
          class="mb-3"
          type="error"
          variant="tonal"
        >
          {{ error }}
        </v-alert>
        <template v-if="mode === 'text'">
          <p>勾选需要分享的科目（默认全选）：</p>
          <div class="d-flex flex-wrap ga-3">
            <v-checkbox
              v-for="subject in textSubjects"
              :key="subject"
              v-model="selectedSubjects"
              :value="subject"
              :label="subject"
              hide-details
            />
          </div>
          <v-textarea
            ref="textPreview"
            :model-value="textDocument"
            label="文字清单预览"
            readonly
            rows="16"
            variant="outlined"
            class="mt-3"
          />
          <v-alert
            v-if="copyNotice"
            type="success"
            variant="tonal"
          >
            {{ copyNotice }}
          </v-alert>
        </template>
        <iframe
          v-if="opened"
          v-show="mode === 'print'"
          ref="preview"
          class="homework-print-preview"
          sandbox="allow-same-origin allow-modals"
          :srcdoc="html"
          title="作业清单打印预览"
          @load="ready = true"
        />
        <div
          v-if="mode === 'print' && images.length"
          class="homework-image-results mt-4"
        >
          <p>共 {{ images.length }} 张图片，长作业已自动分页。请逐张保存，分享时包含全部页。</p>
          <div class="homework-image-grid">
            <div
              v-for="(item, index) in images"
              :key="item.url"
            >
              <a
                :href="item.url"
                :download="item.filename"
              >
                <img
                  :src="item.url"
                  :alt="`作业清单第 ${index + 1} 张预览`"
                  loading="lazy"
                >
                保存第 {{ index + 1 }} 张 PNG
              </a>
            </div>
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn @click="opened = false">
          关闭
        </v-btn>
        <v-spacer />
        <template v-if="mode === 'text'">
          <v-btn
            :disabled="!selectedSubjects.length"
            variant="text"
            @click="selectText"
          >
            全选文字
          </v-btn>
          <v-btn
            :disabled="!selectedSubjects.length || copying"
            :loading="copying"
            color="primary"
            variant="flat"
            prepend-icon="mdi-content-copy"
            @click="copyText"
          >
            复制文字
          </v-btn>
        </template>
        <v-btn
          v-if="mode === 'print'"
          :disabled="!ready || generating"
          prepend-icon="mdi-image-outline"
          variant="tonal"
          @click="generateImages"
        >
          {{ generating ? `生成中 ${progress}` : images.length ? '重新生成图片' : '生成清单图片' }}
        </v-btn>
        <v-btn
          v-if="mode === 'print'"
          color="primary"
          :disabled="!ready"
          prepend-icon="mdi-printer-outline"
          variant="flat"
          @click="print"
        >
          打印 / 保存 PDF
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, onUnmounted, ref, shallowRef, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {homeworkPrintDocument, homeworkPrintSnapshot} from "@/utils/homeworkPrint";
import {homeworkTextDocument, homeworkTextSubjects} from "@/utils/homeworkText";

const props = defineProps({
  className: {type: String, required: true},
  scopeLabel: {type: String, default: ""},
  hideButton: Boolean,
  customSnapshot: {type: Object, default: null},
});
const store = useClassworksV2Store();
const opened = ref(false);
const html = ref("");
const ready = ref(false);
const preview = ref(null);
const error = ref("");
const images = ref([]), generating = ref(false), progress = ref("");
const snapshot = shallowRef(null), mode = ref("print"), selectedSubjects = ref([]);
const textPreview = ref(null), copying = ref(false), copyNotice = ref("");
const textSubjects = computed(() => homeworkTextSubjects(snapshot.value));
const textDocument = computed(() => homeworkTextDocument(snapshot.value, selectedSubjects.value));
let imageController, generation = 0, mounted = true;
watch(selectedSubjects, () => { generation++; copyNotice.value = ""; error.value = ""; }, {deep: true, flush: "sync"});
function clearImages() {
  imageController?.abort(); imageController = null; generating.value = false;
  images.value.forEach(item => URL.revokeObjectURL(item.url)); images.value = [];
}
const disabled = computed(() => props.customSnapshot ? false : store.feedLoading || store.studentLoading
  || !store.activeWorkspaceIds.length || !store.feedGeneratedAt
  || Boolean(store.feedLoadError && !store.feedUsingCache));

// A preview is a fixed copy. Changing the audience/date/selection discards it.
watch(() => JSON.stringify([store.feedAudience, store.boardDate, store.activeWorkspaceIds,
  store.screenSession?.binding?.id, props.className, props.scopeLabel]), () => { opened.value = false; });
watch(opened, value => { if (!value) { generation++; html.value = ""; ready.value = false; snapshot.value = null; copyNotice.value = ""; clearImages(); } }, {flush: "sync"});
onUnmounted(() => { mounted = false; generation++; clearImages(); });

function openPreview(view = "print") {
  if (disabled.value) return;
  const screen = store.feedAudience === "screen";
  const warning = screen && store.screenQueueReadError
    ? "本机待上传队列读取异常，无法确认是否还有未上传的作业。"
    : screen && store.screenPendingUploads.length
      ? `本机还有 ${store.screenPendingUploads.length} 项待处理作业，未包含在本清单中。` : "";
  generation++;
  snapshot.value = props.customSnapshot ? JSON.parse(JSON.stringify(props.customSnapshot)) : homeworkPrintSnapshot({
    publications: store.feed, preparations: store.feedPreparations, workspaceIds: store.activeWorkspaceIds, boardDate: store.boardDate,
    className: props.className, scopeLabel: props.scopeLabel, generatedAt: store.feedGeneratedAt,
    cached: store.feedUsingCache, warning,
  });
  selectedSubjects.value = homeworkTextSubjects(snapshot.value);
  mode.value = view === "text" ? "text" : "print";
  copyNotice.value = "";
  html.value = homeworkPrintDocument(snapshot.value);
  error.value = "";
  ready.value = false;
  opened.value = true;
}

async function generateImages() {
  if (!snapshot.value || generating.value) return;
  clearImages();
  const controller = new AbortController(); imageController = controller;
  const selectedSnapshot = snapshot.value;
  generating.value = true; error.value = ""; progress.value = "";
  try {
    const {renderHomeworkImages} = await import("@/utils/homeworkImages");
    const result = await renderHomeworkImages(selectedSnapshot, {signal: controller.signal,
      onProgress: (done, total) => { if (!controller.signal.aborted) progress.value = `${done}/${total}`; }});
    if (controller.signal.aborted) result.forEach(item => URL.revokeObjectURL(item.url));
    else images.value = result;
  } catch (failure) {
    if (!controller.signal.aborted) error.value = failure.message || "图片生成失败，请重试。";
  } finally { if (imageController === controller) generating.value = false; }
}

async function copyText() {
  if (!opened.value || !snapshot.value || !selectedSubjects.value.length || copying.value) return;
  const current = generation, text = textDocument.value;
  copying.value = true; copyNotice.value = ""; error.value = "";
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
    if (mounted && opened.value && generation === current) copyNotice.value = "文字清单已复制，可粘贴到班级群。";
  } catch {
    if (mounted && opened.value && generation === current) error.value = "浏览器未允许自动复制。请点击“全选文字”，再使用 Ctrl+C 或系统复制菜单手动复制。";
  } finally { copying.value = false; }
}

function selectText() {
  const textarea = textPreview.value?.$el?.querySelector("textarea");
  textarea?.focus(); textarea?.select();
}

function print() {
  if (!ready.value || !preview.value?.contentWindow) return;
  try {
    preview.value.contentWindow.focus();
    preview.value.contentWindow.print();
  } catch {
    error.value = "无法打开打印窗口，请检查浏览器是否允许打印后重试。";
  }
}

defineExpose({openPreview, disabled});
</script>

<style scoped>
.homework-print-preview { width: 100%; height: 60vh; border: 1px solid #ccc; background: white; }
.homework-image-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-top: 12px; }
.homework-image-grid img { width: 100%; display: block; border: 1px solid #ccc; }
.homework-print-dialog :deep(.v-card-actions) { flex-wrap: wrap; gap: 8px; }
</style>
