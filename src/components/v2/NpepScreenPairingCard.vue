<template>
  <section
    class="pairing-page mx-auto"
    aria-labelledby="pairing-title"
  >
    <header class="pairing-heading">
      <div>
        <p class="pairing-eyebrow mb-2">
          NPEP · 设备互联
        </p>
        <h1 id="pairing-title">
          连接 NPEduTools
        </h1>
        <p class="text-medium-emphasis mt-2 mb-0">
          在这台班级大屏获取一次性配对码，完成桌面端互联。
        </p>
      </div>
      <v-chip
        v-if="status"
        :color="status.occupied ? 'info' : status.enabled ? 'success' : 'warning'"
        :prepend-icon="status.occupied ? 'mdi-link-variant' : status.enabled ? 'mdi-check-circle-outline' : 'mdi-lock-outline'"
        size="large"
        variant="tonal"
      >
        {{ status.occupied ? '已连接设备' : status.enabled ? '已开放配对' : '尚未开放配对' }}
      </v-chip>
    </header>

    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="mb-5"
      role="alert"
    >
      {{ error }}
    </v-alert>
    <div
      v-if="!status"
      class="pairing-loading rounded-xl pa-8"
    >
      <v-progress-circular
        v-if="busy"
        indeterminate
        color="primary"
        class="mr-4"
      />
      <span>{{ busy ? '正在检查这台大屏的配对授权…' : '暂时无法读取配对授权，请刷新重试。' }}</span>
      <v-btn
        v-if="!busy"
        variant="tonal"
        color="primary"
        class="ml-4"
        @click="refresh"
      >
        刷新授权状态
      </v-btn>
    </div>

    <template v-else>
      <div
        class="pairing-identity"
        aria-label="当前大屏归属"
      >
        <div><span>学校</span><strong>{{ status.schoolName }}</strong></div>
        <div><span>行政班</span><strong>{{ status.administrativeClassName }}</strong></div>
        <div><span>当前大屏</span><strong>{{ status.screenBindingName }}</strong></div>
      </div>

      <div class="pairing-grid">
        <v-card
          class="pairing-primary rounded-xl"
          variant="outlined"
        >
          <v-card-text class="pairing-primary-content">
            <div class="pairing-section-label">
              配对状态
            </div>
            <div
              v-if="status.occupied"
              class="pairing-state"
            >
              <v-icon
                icon="mdi-link-variant"
                color="info"
                size="44"
              />
              <h2>这台大屏已连接设备</h2>
              <p>不能直接覆盖现有绑定。更换设备前，请学校管理员核实并撤销旧登记。</p>
            </div>
            <div
              v-else-if="!status.enabled"
              class="pairing-state"
            >
              <v-icon
                icon="mdi-lock-outline"
                color="warning"
                size="44"
              />
              <h2>等待学校开放配对</h2>
              <p>学校尚未开放此大屏的 NPEP 网页配对。请管理员在“学校管理 → NPEP 设备互联 → 班级大屏预授权”开放。</p>
            </div>
            <div
              v-else-if="ticket"
              class="pairing-ticket"
              :class="{'pairing-ticket-expired': expired}"
            >
              <div class="pairing-ticket-label">
                一次性配对码
              </div>
              <div class="pairing-code">
                {{ ticket.userCode }}
              </div>
              <div class="pairing-ticket-meta">
                <strong>{{ expired ? '已过期，请重新生成' : `剩余 ${remainingTime}` }}</strong>
                <span>有效至 {{ new Date(ticket.expiresAt).toLocaleString('zh-CN') }} · 仅限一次兑换</span>
              </div>
            </div>
            <div
              v-else
              class="pairing-state"
            >
              <v-icon
                icon="mdi-monitor-cellphone"
                color="primary"
                size="48"
              />
              <h2>可以开始配对</h2>
              <p>先核对上方学校、班级和大屏，再生成供现场安装使用的临时配对码。</p>
            </div>
            <div class="pairing-actions">
              <v-btn
                color="primary"
                variant="flat"
                :disabled="busy || !status.enabled || status.occupied"
                :loading="busy"
                :prepend-icon="ticket ? 'mdi-refresh' : 'mdi-key-plus'"
                size="large"
                @click="generate"
              >
                {{ ticket ? '重新生成配对码' : '生成配对码' }}
              </v-btn>
              <v-btn
                variant="text"
                :disabled="busy"
                @click="refresh"
              >
                刷新授权状态
              </v-btn>
            </div>
            <p
              v-if="ticket"
              class="pairing-security text-medium-emphasis mb-0"
            >
              只向现场安装人员提供。配对码仅保留在当前页面；请勿公开发布。重新生成会使旧码失效。
            </p>
          </v-card-text>
        </v-card>

        <v-card
          class="pairing-guide rounded-xl"
          variant="outlined"
        >
          <v-card-text class="pa-6">
            <div class="pairing-section-label mb-5">
              在 NPEduTools 中完成
            </div>
            <div class="pairing-step">
              <span class="pairing-step-index">1</span>
              <div><h3>填写服务地址</h3><p>在初始设置或“学校互联”中输入以下后端地址，并检查服务。</p></div>
            </div>
            <v-text-field
              :model-value="status.origin"
              label="NPEduTools 服务提供商地址（后端）"
              readonly
              variant="outlined"
              hide-details
              class="pairing-origin"
            />
            <div class="pairing-step pairing-step-second">
              <span class="pairing-step-index">2</span>
              <div><h3>输入配对码并核对归属</h3><p>输入本页生成的配对码，核对学校、班级和大屏，在本机确认。无需管理员再次现场批准。</p></div>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </template>
  </section>
</template>

<script setup>
import {ref, computed, onMounted, onUnmounted} from 'vue';
import {getClassroomScreenToken, npepScreenPairingApi} from '@/utils/classworksV2Client';
import {npepErrorMessage} from '@/utils/npepPresentation';
const status = ref(null), ticket = ref(null), error = ref(''), busy = ref(false), serverNow = ref(0);
let controller, disposed = false, requestId, serverAt = 0, receivedAt = 0;
const expired = computed(() => ticket.value && Date.parse(ticket.value.expiresAt) <= serverNow.value);
const remainingTime = computed(() => {
  if (!ticket.value) return '';
  const seconds = Math.max(0, Math.ceil((Date.parse(ticket.value.expiresAt) - serverNow.value) / 1000));
  return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
});
const timer = setInterval(() => { serverNow.value = serverAt + Math.max(0, globalThis.performance.now() - receivedAt); }, 1000);
async function run(create) {
  if (busy.value || disposed) return;
  const token = getClassroomScreenToken();
  // A replacement request may have reached the server even when its reply is lost.
  if (create) ticket.value = null;
  busy.value = true; error.value = ''; controller = new AbortController();
  try {
    const result = await npepScreenPairingApi.request(create ? {requestId: requestId ||= globalThis.crypto.randomUUID()} : null, {signal: controller.signal});
    if (disposed || token !== getClassroomScreenToken()) return;
    serverAt = Date.parse(result.serverTime); receivedAt = globalThis.performance.now(); serverNow.value = serverAt;
    if (create) { ticket.value = result; requestId = null; }
    else { status.value = result; if (!result.enabled || result.occupied) ticket.value = null; }
  } catch (failure) {
    if (!disposed && token === getClassroomScreenToken()) {
      error.value = npepErrorMessage(failure);
      if ([401, 403, 409, 410].includes(failure.response?.status)) { ticket.value = null; requestId = null; }
      if (!create) status.value = null;
    }
  } finally { if (!disposed) busy.value = false; }
}
const refresh = () => run(false);
const generate = () => run(true);
onMounted(refresh);
onUnmounted(() => { disposed = true; controller?.abort(); clearInterval(timer); ticket.value = null; });
</script>

<style scoped>
.pairing-page { max-width: 1120px; color: rgb(var(--v-theme-on-surface)); }
.pairing-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 28px; }
.pairing-eyebrow { color: rgb(var(--v-theme-primary)); font-size: 13px; font-weight: 800; letter-spacing: .08em; }
.pairing-heading h1 { color: rgb(var(--v-theme-on-surface)); font-size: clamp(30px, 2.7vw, 42px); font-weight: 750; line-height: 1.2; }
.pairing-heading :deep(.v-chip) { flex-shrink: 0; }
.pairing-loading { display: flex; align-items: center; background: rgba(var(--v-theme-primary), .06); }
.pairing-identity { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px; }
.pairing-identity > div { display: grid; gap: 5px; min-width: 0; padding: 16px 20px; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 14px; background: rgb(var(--v-theme-surface)); }
.pairing-identity span { color: rgba(var(--v-theme-on-surface), .65); font-size: 13px; }
.pairing-identity strong { color: rgb(var(--v-theme-on-surface)); overflow-wrap: anywhere; font-size: 19px; line-height: 1.3; }
.pairing-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; }
.pairing-primary, .pairing-guide { border-color: rgba(var(--v-border-color), .2) !important; }
.pairing-primary-content { display: flex; flex-direction: column; height: 100%; min-height: 396px; padding: 24px !important; }
.pairing-section-label { color: rgba(var(--v-theme-on-surface), .65); font-size: 13px; font-weight: 800; letter-spacing: .06em; }
.pairing-state { display: flex; flex: 1; flex-direction: column; align-items: flex-start; justify-content: center; gap: 12px; padding: 22px 2px; }
.pairing-state h2 { color: rgb(var(--v-theme-on-surface)); font-size: clamp(24px, 2vw, 30px); font-weight: 750; line-height: 1.25; }
.pairing-state p { max-width: 54ch; margin: 0; color: rgba(var(--v-theme-on-surface), .72); font-size: 16px; line-height: 1.7; }
.pairing-ticket { display: flex; flex: 1; flex-direction: column; justify-content: center; min-width: 0; margin: 16px 0; padding: 28px; border-radius: 18px; background: #27221e; color: #fffaf3; }
.pairing-ticket-expired { background: #514c48; }
.pairing-ticket-label { color: #f2bb83; font-size: 17px; font-weight: 700; }
.pairing-code { margin: 12px 0 16px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: clamp(42px, 5.5vw, 72px); font-weight: 800; letter-spacing: .12em; line-height: 1.15; white-space: nowrap; }
.pairing-ticket-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 20px; }
.pairing-ticket-meta strong { font-size: 18px; }
.pairing-ticket-meta span { color: #e1d6cc; font-size: 14px; }
.pairing-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pairing-security { margin-top: 16px; font-size: 13px; line-height: 1.6; }
.pairing-step { display: flex; align-items: flex-start; gap: 14px; }
.pairing-step-index { display: grid; flex: 0 0 30px; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: rgba(var(--v-theme-primary), .13); color: rgb(var(--v-theme-primary)); font-weight: 800; }
.pairing-step h3 { color: rgb(var(--v-theme-on-surface)); margin-bottom: 7px; font-size: 18px; font-weight: 700; }
.pairing-step p { margin: 0 0 17px; color: rgba(var(--v-theme-on-surface), .72); font-size: 15px; line-height: 1.65; }
.pairing-origin { margin-left: 44px; color: rgb(var(--v-theme-on-surface)); }
.pairing-origin :deep(input) { color: rgb(var(--v-theme-on-surface)); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 15px; }
.pairing-step-second { margin-top: 27px; }
@media (max-width: 760px) {
  .pairing-heading { flex-direction: column; gap: 16px; }
  .pairing-identity { grid-template-columns: 1fr; gap: 8px; }
  .pairing-identity > div { padding: 10px 16px; }
  .pairing-grid { grid-template-columns: 1fr; }
  .pairing-primary-content { min-height: 0; }
  .pairing-state { min-height: 210px; }
  .pairing-code { font-size: clamp(26px, 7.7vw, 52px); letter-spacing: .06em; }
  .pairing-ticket { padding: 20px; }
  .pairing-origin { margin-left: 0; }
}
@media (max-width: 380px) {
  .pairing-code { font-size: 25px; letter-spacing: .03em; }
}
</style>
