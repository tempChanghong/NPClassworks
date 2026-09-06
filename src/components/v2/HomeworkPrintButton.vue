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
          预览当前班级与日期的已加载作业，确认后可打印；保存 PDF 请在系统打印窗口选择“另存为 PDF”。
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
      </v-card-text>
      <v-card-actions>
        <v-btn @click="opened = false">
          关闭
        </v-btn>
        <v-spacer />
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
import {computed, ref, watch} from "vue";
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
const disabled = computed(() => store.feedLoading || store.studentLoading
  || !store.activeWorkspaceIds.length || !store.feedGeneratedAt
  || Boolean(store.feedLoadError && !store.feedUsingCache));

// A preview is a fixed copy. Changing the audience/date/selection discards it.
watch(() => JSON.stringify([store.feedAudience, store.boardDate, store.activeWorkspaceIds,
  store.screenSession?.binding?.id, props.className, props.scopeLabel]), () => { opened.value = false; });
watch(opened, value => { if (!value) { html.value = ""; ready.value = false; } });

function openPreview() {
  if (disabled.value) return;
  const screen = store.feedAudience === "screen";
  const warning = screen && store.screenQueueReadError
    ? "本机待上传队列读取异常，无法确认是否还有未上传的作业。"
    : screen && store.screenPendingUploads.length
      ? `本机还有 ${store.screenPendingUploads.length} 项待处理作业，未包含在本清单中。` : "";
  html.value = homeworkPrintDocument(homeworkPrintSnapshot({
    publications: store.feed, workspaceIds: store.activeWorkspaceIds, boardDate: store.boardDate,
    className: props.className, scopeLabel: props.scopeLabel, generatedAt: store.feedGeneratedAt,
    cached: store.feedUsingCache, warning,
  }));
  error.value = "";
  ready.value = false;
  opened.value = true;
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
</style>
