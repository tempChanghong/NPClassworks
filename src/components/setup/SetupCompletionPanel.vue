<template>
  <v-card
    class="rounded-xl"
    elevation="3"
  >
    <v-card-title class="pa-6 pb-2">
      检查并完成
    </v-card-title>
    <v-card-text class="pa-6 pt-3">
      <v-alert
        class="mb-5"
        type="success"
        variant="tonal"
      >
        核心数据已经可用。完成后将锁定安装入口，未配置的班级、教师和大屏仍可在学校管理后台继续添加。
      </v-alert>
      <div class="setup-section mb-5">
        <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-3">
          <div>
            <div class="text-h6">
              一次性账号交付中心
            </div>
            <div class="text-body-2 text-medium-emphasis">
              明文凭据只保存在当前页面内存中。刷新、离开或完成初始化后无法再次查看，只能由管理员重置。
            </div>
          </div>
          <div
            v-if="credentialEntries.length"
            class="d-flex flex-wrap ga-2"
          >
            <v-btn
              :prepend-icon="showSecrets ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              variant="tonal"
              @click="showSecrets = !showSecrets"
            >
              {{ showSecrets ? '隐藏凭据' : '显示凭据' }}
            </v-btn>
            <v-btn
              prepend-icon="mdi-file-download-outline"
              variant="tonal"
              @click="$emit('download-credentials')"
            >
              下载 CSV
            </v-btn>
          </div>
        </div>
        <v-alert
          v-if="!credentialEntries.length"
          type="warning"
          variant="tonal"
        >
          当前没有待交付的账号凭据。请完成登录测试；忘记 PIN 时可在管理后台重置。
        </v-alert>
        <v-alert
          v-if="deliveryWarning"
          class="mb-3"
          type="warning"
          variant="tonal"
        >
          {{ deliveryWarning }}
        </v-alert>
        <template v-else>
          <v-table class="credential-table rounded-lg">
            <thead><tr><th>类型 / 名称</th><th>账号</th><th>初始凭据</th><th>用途</th><th /></tr></thead>
            <tbody>
              <tr
                v-for="item in credentialEntries"
                :key="item.id"
              >
                <td>
                  <strong>{{ credentialTypes[item.kind] || item.kind }}</strong><div class="text-caption text-medium-emphasis">
                    {{ item.name }}
                  </div>
                </td>
                <td>{{ item.username }}</td>
                <td>
                  <span class="credential-secret">{{ showSecrets ? item.secret : '••••••••' }}</span><div class="text-caption text-medium-emphasis">
                    {{ item.secretLabel }}
                  </div>
                </td>
                <td>{{ item.detail }}</td>
                <td class="text-no-wrap">
                  <v-btn
                    icon="mdi-content-copy"
                    size="small"
                    title="复制凭据"
                    variant="text"
                    @click="$emit('copy-credential', item)"
                  />
                  <v-btn
                    v-if="item.kind !== 'SHARED_PASSWORD'"
                    icon="mdi-shield-check-outline"
                    size="small"
                    title="验证该账号"
                    variant="text"
                    @click="$emit('test-credential', item)"
                  />
                </td>
              </tr>
            </tbody>
          </v-table>
          <v-checkbox
            v-model="acknowledged"
            class="mt-3"
            color="primary"
            hide-details
            label="我已下载、复制或打印并妥善保存本次创建的账号凭据"
          />
        </template>
      </div>

      <div class="setup-section mb-5">
        <div class="d-flex align-center ga-3 mb-2">
          <v-icon
            color="primary"
            icon="mdi-shield-check-outline"
          />
          <div class="text-h6">
            上线前登录测试
          </div>
          <v-chip
            :color="verifiedKinds.OWNER ? 'success' : 'warning'"
            size="small"
            variant="tonal"
          >
            {{ verifiedKinds.OWNER ? '管理员已验证' : '需验证管理员' }}
          </v-chip>
        </div>
        <div class="text-body-2 text-medium-emphasis mb-4">
          检查教师账号、管理员账号和大屏账号是否可以正常登录。
        </div>
        <v-row>
          <v-col
            cols="12"
            md="3"
          >
            <v-select
              v-model="login.kind"
              :items="loginTestKindOptions"
              item-title="title"
              item-value="value"
              label="账号类型"
              variant="outlined"
              @update:model-value="clearLoginResult"
            />
          </v-col>
          <v-col
            cols="12"
            md="4"
          >
            <v-text-field
              v-model.trim="login.username"
              :label="login.kind === 'SCREEN' ? '大屏登录账号' : '短账号'"
              variant="outlined"
            />
          </v-col>
          <v-col
            cols="12"
            md="5"
          >
            <v-text-field
              v-model="login.password"
              :label="login.kind === 'TEACHER' && setupContext?.school?.teacherAuthMode === 'SHARED_PASSWORD' ? '学校通用教师口令' : 'PIN'"
              type="password"
              variant="outlined"
              @keyup.enter="$emit('run-login-test')"
            />
          </v-col>
        </v-row>
        <v-alert
          v-if="login.message"
          class="mb-3"
          type="success"
          variant="tonal"
        >
          {{ login.message }}
        </v-alert>
        <v-alert
          v-if="login.error"
          class="mb-3"
          type="error"
          variant="tonal"
        >
          {{ login.error }}
        </v-alert>
        <v-btn
          color="primary"
          :disabled="!login.username || !login.password"
          :loading="login.loading"
          prepend-icon="mdi-login-variant"
          variant="tonal"
          @click="$emit('run-login-test')"
        >
          验证登录凭据
        </v-btn>
      </div>
      <v-row class="mb-4">
        <v-col
          v-for="item in countItems"
          :key="item.title"
          cols="6"
          md="3"
        >
          <div class="count-tile">
            <v-icon
              :icon="item.icon"
              color="primary"
            /><div><strong>{{ item.value }}</strong><span>{{ item.title }}</span></div>
          </div>
        </v-col>
      </v-row>
      <v-alert
        v-if="!status?.counts?.workspaces"
        class="mb-3"
        type="warning"
        variant="tonal"
      >
        尚未设置班级。完成后请优先进入“组织与教学关系”配置。
      </v-alert>
      <v-alert
        v-if="!status?.counts?.screens"
        class="mb-5"
        type="info"
        variant="tonal"
      >
        大屏账号可以稍后在学校管理后台创建。
      </v-alert>
      <div class="d-flex flex-wrap ga-3">
        <v-btn
          color="primary"
          :disabled="!canFinish"
          :loading="saving"
          prepend-icon="mdi-lock-check-outline"
          size="large"
          @click="$emit('finish')"
        >
          完成并锁定初始化
        </v-btn>
        <v-btn
          variant="text"
          @click="$emit('return-to-configuration')"
        >
          返回补充配置
        </v-btn>
      </div>
      <div
        v-if="!canFinish"
        class="text-body-2 text-warning mt-3"
      >
        完成前必须通过管理员登录测试；若本页保存了新凭据，还需确认已经完成交付。
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
defineProps({
  canFinish: Boolean,
  countItems: {type: Array, default: () => []},
  credentialEntries: {type: Array, default: () => []},
  credentialTypes: {type: Object, default: () => ({})},
  deliveryWarning: {type: String, default: ""},
  loginTestKindOptions: {type: Array, default: () => []},
  saving: Boolean,
  setupContext: {type: Object, default: null},
  status: {type: Object, default: null},
  verifiedKinds: {type: Object, required: true},
});

defineEmits(["copy-credential", "download-credentials", "finish", "return-to-configuration", "run-login-test", "test-credential"]);

const showSecrets = defineModel("showSecrets", {type: Boolean, default: false});
const acknowledged = defineModel("acknowledged", {type: Boolean, default: false});
const login = defineModel("login", {type: Object, required: true});

function clearLoginResult() {
  login.value.message = "";
  login.value.error = "";
}
</script>

<style scoped>
.count-tile { align-items: center; background: rgba(var(--v-theme-surface-variant), .38); border-radius: 14px; display: flex; gap: 12px; min-height: 76px; padding: 14px; }
.count-tile strong, .count-tile span { display: block; }
.count-tile strong { font-size: 1.35rem; }
.count-tile span { color: rgba(var(--v-theme-on-surface), .62); font-size: .78rem; }
.setup-section { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 16px; padding: 18px; }
.credential-table { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.credential-secret { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 700; letter-spacing: .04em; }
</style>
