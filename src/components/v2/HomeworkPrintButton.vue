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
  <v-dialog
    v-model="opened"
    max-width="900"
    scrollable
  >
    <v-card class="homework-print-dialog rounded-xl">
      <v-card-title>作业清单预览</v-card-title>
      <v-card-text>
        <p class="mb-3 text-body-2">
          预览当前班级与日期的已加载作业，可生成图片或打印；保存 PDF 请在系统打印窗口选择“另存为 PDF”。
        </p>
        <v-alert
          v-if="error"
          class="mb-3"
          type="error"
          variant="tonal"
        >
          {{ error }}
        </v-alert>
        <iframe
          v-if="opened"
          ref="preview"
          class="homework-print-preview"
          sandbox="allow-same-origin allow-modals"
          :srcdoc="html"
          title="作业清单打印预览"
          @load="ready = true"
        />
        <div
          v-if="images.length"
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
        <v-btn
          :disabled="!ready || generating"
          prepend-icon="mdi-image-outline"
          variant="tonal"
          @click="generateImages"
        >
          {{ generating ? `生成中 ${progress}` : images.length ? '重新生成图片' : '生成清单图片' }}
        </v-btn>
        <v-btn
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
import {computed, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {homeworkPrintDocument, homeworkPrintSnapshot} from "@/utils/homeworkPrint";

const props = defineProps({
  className: {type: String, required: true},
  scopeLabel: {type: String, default: ""},
  hideButton: Boolean,
});
const store = useClassworksV2Store();
const opened = ref(false);
const html = ref("");
const ready = ref(false);
const preview = ref(null);
const error = ref("");
const images = ref([]), generating = ref(false), progress = ref("");
let snapshot, imageController;
function clearImages() {
  imageController?.abort(); imageController = null; generating.value = false;
  images.value.forEach(item => URL.revokeObjectURL(item.url)); images.value = [];
}
const disabled = computed(() => store.feedLoading || store.studentLoading
  || !store.activeWorkspaceIds.length || !store.feedGeneratedAt
  || Boolean(store.feedLoadError && !store.feedUsingCache));

// A preview is a fixed copy. Changing the audience/date/selection discards it.
watch(() => JSON.stringify([store.feedAudience, store.boardDate, store.activeWorkspaceIds,
  store.screenSession?.binding?.id, props.className, props.scopeLabel]), () => { opened.value = false; });
watch(opened, value => { if (!value) { html.value = ""; ready.value = false; snapshot = null; clearImages(); } });
onUnmounted(clearImages);

function openPreview() {
  if (disabled.value) return;
  const screen = store.feedAudience === "screen";
  const warning = screen && store.screenQueueReadError
    ? "本机待上传队列读取异常，无法确认是否还有未上传的作业。"
    : screen && store.screenPendingUploads.length
      ? `本机还有 ${store.screenPendingUploads.length} 项待处理作业，未包含在本清单中。` : "";
  snapshot = homeworkPrintSnapshot({
    publications: store.feed, preparations: store.feedPreparations, workspaceIds: store.activeWorkspaceIds, boardDate: store.boardDate,
    className: props.className, scopeLabel: props.scopeLabel, generatedAt: store.feedGeneratedAt,
    cached: store.feedUsingCache, warning,
  });
  html.value = homeworkPrintDocument(snapshot);
  error.value = "";
  ready.value = false;
  opened.value = true;
}

async function generateImages() {
  if (!snapshot || generating.value) return;
  clearImages();
  const controller = new AbortController(); imageController = controller;
  const selectedSnapshot = snapshot;
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
