<template>
  <v-dialog
    :model-value="appRecoveryState.visible"
    max-width="620"
    persistent
    scrim="black"
    :z-index="5000"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center ga-3 pa-5 pb-2">
        <v-icon
          color="warning"
          icon="mdi-alert-circle-outline"
        />
        {{ appRecoveryState.title }}
      </v-card-title>
      <v-card-text class="px-5">
        <p class="mb-3">
          {{ appRecoveryState.message }}
        </p>
        <v-alert
          v-if="appRecoveryState.detail"
          class="mb-2 recovery-detail"
          density="compact"
          type="warning"
          variant="tonal"
        >
          {{ appRecoveryState.detail }}
        </v-alert>
        <p class="text-medium-emphasis text-body-2 mb-0">
          清理资源缓存不会退出账号，也不会删除草稿、选班或大屏绑定。
        </p>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2 px-5 pb-5">
        <v-btn
          prepend-icon="mdi-download-outline"
          variant="text"
          @click="downloadDiagnostics"
        >
          下载诊断包
        </v-btn>
        <v-spacer />
        <v-btn
          :disabled="busy"
          variant="text"
          @click="dismissAppRecovery"
        >
          暂时关闭
        </v-btn>
        <v-btn
          :disabled="busy"
          prepend-icon="mdi-refresh"
          variant="tonal"
          @click="reloadApplication"
        >
          重新加载
        </v-btn>
        <v-btn
          color="primary"
          :loading="busy"
          prepend-icon="mdi-cached"
          @click="clearAndReload"
        >
          清理缓存并重新加载
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {ref} from "vue";
import packageInfo from "../../../package.json";
import {
  appRecoveryState,
  clearResourcesAndReload,
  dismissAppRecovery,
  reloadApplication,
} from "@/utils/appRecovery";
import {createDiagnosticBundle, downloadDiagnosticBundle} from "@/utils/localDiagnostics";
import {getServerUrl} from "@/utils/socketClient";

const busy = ref(false);

async function downloadDiagnostics() {
  const bundle = await createDiagnosticBundle({
    app: {name: "NPClassworks", version: packageInfo.version, codename: packageInfo.codename, codenameZh: packageInfo.codenameZh},
    backendUrl: getServerUrl(),
    context: {
      page: "recovery",
      recovery: {
        kind: appRecoveryState.kind,
        title: appRecoveryState.title,
        occurredAt: appRecoveryState.occurredAt,
      },
    },
  });
  downloadDiagnosticBundle(bundle, `npclassworks-recovery-${Date.now()}.json`);
}

async function clearAndReload() {
  busy.value = true;
  try {
    await clearResourcesAndReload();
  } catch {
    reloadApplication();
  }
}
</script>

<style scoped>
.recovery-detail {
  overflow-wrap: anywhere;
}
</style>
