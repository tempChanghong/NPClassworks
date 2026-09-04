<template>
  <v-card class="rounded-xl">
    <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5 pb-2">
      <v-icon
        color="primary"
        icon="mdi-file-cog-outline"
      />
      前端故障诊断包
      <v-chip
        size="small"
        variant="tonal"
      >
        {{ diagnostics.events.length }} 条本地记录
      </v-chip>
      <v-spacer />
      <v-btn
        :loading="downloading"
        prepend-icon="mdi-download-outline"
        variant="tonal"
        @click="download"
      >
        下载诊断包
      </v-btn>
    </v-card-title>
    <v-card-text class="px-5 pb-5">
      <v-alert
        class="mb-4"
        type="info"
        variant="tonal"
      >
        文件保存在当前设备，不会自动上传。诊断包包含版本与运行环境、最近接口和同步错误，以及当前管理总览中的大屏异常；不包含账号凭据、作业正文或请求内容。
      </v-alert>
      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-chip
          prepend-icon="mdi-tag-outline"
          size="small"
        >
          v{{ packageInfo.version }} {{ packageInfo.codename }}
        </v-chip>
        <v-chip
          prepend-icon="mdi-api"
          size="small"
        >
          {{ backendOrigin }}
        </v-chip>
        <v-chip
          :color="navigatorOnline ? 'success' : 'warning'"
          prepend-icon="mdi-lan-connect"
          size="small"
          variant="tonal"
        >
          {{ navigatorOnline ? "当前联网" : "当前离线" }}
        </v-chip>
      </div>
      <v-list
        v-if="recentEvents.length"
        class="diagnostic-event-list rounded-lg"
        density="compact"
        lines="two"
      >
        <v-list-item
          v-for="event in recentEvents"
          :key="`${event.at}-${event.code}`"
          :subtitle="`${categoryName(event.category)} · ${formatTime(event.lastAt || event.at)}${event.count > 1 ? ` · 重复 ${event.count} 次` : ''}`"
          :title="event.message"
        >
          <template #prepend>
            <v-icon
              :color="event.severity === 'ERROR' ? 'error' : event.severity === 'WARNING' ? 'warning' : 'success'"
              :icon="event.severity === 'ERROR' ? 'mdi-alert-circle-outline' : event.severity === 'WARNING' ? 'mdi-alert-outline' : 'mdi-check-circle-outline'"
            />
          </template>
        </v-list-item>
      </v-list>
      <v-empty-state
        v-else
        icon="mdi-check-circle-outline"
        text="当前设备最近没有记录到前端故障"
      />
      <div class="d-flex align-center flex-wrap ga-2 mt-3">
        <div class="text-caption text-medium-emphasis">
          本地记录最多保留 150 条，并在 7 天后自动清理。
        </div>
        <v-spacer />
        <v-btn
          v-if="diagnostics.events.length || Object.keys(diagnostics.snapshots).length"
          color="warning"
          prepend-icon="mdi-delete-sweep-outline"
          size="small"
          variant="text"
          @click="clear"
        >
          清空本地记录
        </v-btn>
      </div>
      <v-alert
        v-if="feedback"
        class="mt-3"
        type="success"
        variant="tonal"
      >
        {{ feedback }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup>
import {computed, onUnmounted, ref} from "vue";
import packageInfo from "../../../package.json";
import {confirmAction} from "@/utils/actionDialog";
import {
  clearLocalDiagnostics,
  createDiagnosticBundle,
  downloadDiagnosticBundle,
  getLocalDiagnostics,
  onLocalDiagnosticsChange,
} from "@/utils/localDiagnostics";
import {getServerUrl} from "@/utils/socketClient";

const props = defineProps({
  managementOverview: {type: Object, default: null},
});

const diagnostics = ref(getLocalDiagnostics());
const downloading = ref(false);
const feedback = ref("");
const navigatorOnline = ref(typeof navigator === "undefined" || navigator.onLine);
const backendOrigin = computed(() => {
  try {
    return new URL(getServerUrl(), window.location.origin).origin;
  } catch {
    return "API 地址不可用";
  }
});
const recentEvents = computed(() => diagnostics.value.events.slice(-5).reverse());
const stopListening = onLocalDiagnosticsChange(() => {
  diagnostics.value = getLocalDiagnostics();
});
const updateOnline = () => {
  navigatorOnline.value = navigator.onLine;
};
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);

function categoryName(category) {
  return {
    API: "接口",
    APP: "页面",
    REALTIME: "实时连接",
    SCREEN_SYNC: "大屏同步",
    SCREEN_HEARTBEAT: "大屏心跳",
  }[category] || category;
}

function formatTime(value) {
  return new Date(value).toLocaleString("zh-CN");
}

async function download() {
  downloading.value = true;
  feedback.value = "";
  try {
    const bundle = await createDiagnosticBundle({
      app: {name: "NPClassworks", version: packageInfo.version, codename: packageInfo.codename, codenameZh: packageInfo.codenameZh},
      backendUrl: getServerUrl(),
      managementOverview: props.managementOverview,
      context: {page: "school-management-overview"},
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadDiagnosticBundle(bundle, `NPClassworks-diagnostics-${stamp}.json`);
    feedback.value = "诊断包已下载，可直接交给部署或开发人员分析。";
  } finally {
    downloading.value = false;
  }
}

async function clear() {
  if (!await confirmAction({
    title: "清空本地诊断记录？",
    message: "将删除当前浏览器最近保存的接口和同步故障记录，不会影响作业、通知或学校配置。",
    confirmText: "清空记录",
    color: "warning",
  })) return;
  clearLocalDiagnostics();
  diagnostics.value = getLocalDiagnostics();
  feedback.value = "本地诊断记录已清空。";
}

onUnmounted(() => {
  stopListening();
  window.removeEventListener("online", updateOnline);
  window.removeEventListener("offline", updateOnline);
});
</script>

<style scoped>
.diagnostic-event-list {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
