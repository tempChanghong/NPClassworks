<template>
  <v-card class="rounded-xl">
    <v-card-title class="d-flex align-center ga-3 pa-5 pb-2">
      <v-icon
        color="primary"
        icon="mdi-server-network"
      />
      迁移服务器数据
    </v-card-title>
    <v-card-text class="px-5 pb-5">
      <v-alert
        class="mb-5"
        type="info"
        variant="tonal"
      >
        导出当前学校的加密迁移包，可在新服务器的初始化页面中导入。
      </v-alert>

      <v-alert
        v-if="errorMessage"
        class="mb-4"
        closable
        type="error"
        variant="tonal"
        @click:close="errorMessage = ''"
      >
        {{ errorMessage }}
      </v-alert>
      <v-alert
        v-if="downloaded"
        class="mb-4"
        type="success"
        variant="tonal"
      >
        迁移包已下载。请将文件与迁移密码分开保存，并在切换域名前停止旧服务器上的正式写入。
      </v-alert>

      <template v-if="readiness">
        <div class="migration-summary mb-5">
          <div>
            <span>学校</span>
            <strong>{{ readiness.school.name }}</strong>
            <small>{{ readiness.school.code }}</small>
          </div>
          <div
            v-for="item in countItems"
            :key="item.label"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>

        <v-alert
          class="mb-5"
          type="warning"
          variant="tonal"
        >
          迁移后网页账号需要重新登录；大屏账号和 PIN 会保留，但设备令牌会失效，每台大屏需要重新登录绑定。OAuth 用户也需要重新授权。
        </v-alert>

        <div class="text-subtitle-1 font-weight-bold mb-3">
          1. 设置迁移包密码
        </div>
        <v-row>
          <v-col
            cols="12"
            md="7"
          >
            <v-text-field
              v-model="passphrase"
              :append-inner-icon="showPassphrase ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              hint="至少 12 个字符；新服务器导入时必须使用"
              label="迁移密码"
              persistent-hint
              :type="showPassphrase ? 'text' : 'password'"
              variant="outlined"
              @click:append-inner="showPassphrase = !showPassphrase"
            />
          </v-col>
          <v-col
            class="d-flex align-start ga-2"
            cols="12"
            md="5"
          >
            <v-btn
              prepend-icon="mdi-auto-fix"
              variant="tonal"
              @click="generatePassphrase"
            >
              生成强密码
            </v-btn>
            <v-btn
              :disabled="!passphrase"
              icon="mdi-content-copy"
              title="复制迁移密码"
              variant="text"
              @click="copyPassphrase"
            />
          </v-col>
        </v-row>

        <div class="text-subtitle-1 font-weight-bold mt-3 mb-3">
          2. 验证管理员身份
        </div>
        <v-text-field
          v-if="readiness.reauthMethod === 'PIN'"
          v-model="currentPin"
          autocomplete="current-password"
          label="当前管理员 PIN"
          type="password"
          variant="outlined"
        />
        <v-text-field
          v-else
          v-model.trim="confirmationSchoolCode"
          :hint="`请输入 ${readiness.school.code}`"
          label="完整学校代码"
          persistent-hint
          variant="outlined"
        />

        <v-checkbox
          v-model="acknowledged"
          color="warning"
          label="我明白该文件包含整校业务数据，目标必须是空白实例，并会妥善保管迁移文件和密码"
        />

        <div class="d-flex flex-wrap ga-3">
          <v-btn
            color="primary"
            :disabled="!canExport"
            :loading="exporting"
            prepend-icon="mdi-package-down"
            size="large"
            @click="exportPackage"
          >
            生成并下载迁移包
          </v-btn>
          <v-btn
            :loading="loading"
            prepend-icon="mdi-refresh"
            variant="text"
            @click="loadReadiness"
          >
            重新统计
          </v-btn>
        </div>
      </template>

      <v-skeleton-loader
        v-else
        type="article, actions"
      />
    </v-card-text>
  </v-card>
</template>

<script setup>
import {computed, onMounted, ref, watch} from "vue";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";

const props = defineProps({schoolId: {type: String, required: true}});
const readiness = ref(null);
const loading = ref(false);
const exporting = ref(false);
const errorMessage = ref("");
const downloaded = ref(false);
const passphrase = ref("");
const showPassphrase = ref(false);
const currentPin = ref("");
const confirmationSchoolCode = ref("");
const acknowledged = ref(false);

const countItems = computed(() => {
  const counts = readiness.value?.counts || {};
  return [
    {label: "账号", value: counts.accounts || 0},
    {label: "教学空间", value: counts.workspaces || 0},
    {label: "大屏", value: counts.screens || 0},
    {label: "作业与通知", value: counts.publications || 0},
    {label: "历史版本", value: counts.revisions || 0},
    {label: "审计记录", value: counts.auditLogs || 0},
  ];
});
const canExport = computed(() => acknowledged.value && passphrase.value.length >= 12 && (
  readiness.value?.reauthMethod === "PIN"
    ? Boolean(currentPin.value)
    : confirmationSchoolCode.value.toUpperCase() === readiness.value?.school?.code?.toUpperCase()
));

function generatePassphrase() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  passphrase.value = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  showPassphrase.value = true;
}
async function copyPassphrase() {
  await navigator.clipboard.writeText(passphrase.value);
}
async function loadReadiness() {
  if (!props.schoolId) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    readiness.value = await classworksV2Api.schoolMigrationReadiness(props.schoolId);
  } catch (error) {
    readiness.value = null;
    errorMessage.value = describeApiError(error, "无法读取迁移数据统计");
  } finally {
    loading.value = false;
  }
}
async function exportPackage() {
  exporting.value = true;
  errorMessage.value = "";
  downloaded.value = false;
  try {
    const result = await classworksV2Api.exportSchoolMigration(props.schoolId, {
      passphrase: passphrase.value,
      currentPin: currentPin.value,
      confirmationSchoolCode: confirmationSchoolCode.value,
    });
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    currentPin.value = "";
    confirmationSchoolCode.value = "";
    downloaded.value = true;
  } catch (error) {
    errorMessage.value = describeApiError(error, "迁移包生成失败");
  } finally {
    exporting.value = false;
  }
}

watch(() => props.schoolId, () => {
  readiness.value = null;
  downloaded.value = false;
  acknowledged.value = false;
  currentPin.value = "";
  confirmationSchoolCode.value = "";
  void loadReadiness();
});
onMounted(loadReadiness);
</script>

<style scoped>
.migration-summary {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.migration-summary > div {
  background: rgba(var(--v-theme-surface-variant), .42);
  border-radius: 14px;
  min-width: 0;
  padding: 14px;
}
.migration-summary span,
.migration-summary small,
.migration-summary strong { display: block; }
.migration-summary span,
.migration-summary small { color: rgba(var(--v-theme-on-surface), .62); }
.migration-summary strong { font-size: 1.25rem; overflow-wrap: anywhere; }
@media (max-width: 959px) {
  .migration-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .migration-summary { grid-template-columns: 1fr; }
}
</style>
