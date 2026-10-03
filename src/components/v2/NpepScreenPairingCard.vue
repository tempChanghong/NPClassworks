<template>
  <v-card
    class="rounded-xl mx-auto"
    max-width="820"
    variant="outlined"
  >
    <v-card-title class="font-weight-bold pa-6">
      连接 NPEduTools
    </v-card-title>
    <v-card-text>
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-4"
      >
        {{ error }}
      </v-alert>
      <template v-if="status">
        <p class="mb-3">
          {{ status.schoolName }} · {{ status.administrativeClassName }} · {{ status.screenBindingName }}
        </p>
        <v-alert
          v-if="status.occupied"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          此大屏已有 NPEduTools 绑定，不能覆盖。更换设备前请由管理员核实并撤销旧登记。
        </v-alert>
        <v-alert
          v-else-if="!status.enabled"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          学校尚未开放此大屏的 NPEP 网页配对。请管理员在“学校管理 → NPEP 设备互联 → 班级大屏预授权”开放。
        </v-alert>
        <p
          v-else
          class="mb-4"
        >
          生成配对码后，在 NPEduTools 的初始设置或学校互联页输入下方服务地址、检查服务并输入配对码，再核对学校与班级归属。无需管理员再次现场批准。
        </p>
        <v-text-field
          :model-value="status.origin"
          label="NPEduTools 服务提供商地址（后端）"
          readonly
          variant="outlined"
        />
        <div
          v-if="ticket"
          class="mb-4"
        >
          <div
            class="text-h3 font-weight-bold mb-3"
            style="letter-spacing: .15em"
          >
            {{ ticket.userCode }}
          </div>
          <p>有效至 {{ new Date(ticket.expiresAt).toLocaleString('zh-CN') }}；仅限一次兑换。{{ expired ? '已过期，请重新生成。' : '' }}</p>
          <p class="text-caption mt-2">
            只向现场安装人员提供。配对码仅保留在当前页面；请勿公开发布。
          </p>
        </div>
        <v-btn
          color="primary"
          :disabled="busy || !status.enabled || status.occupied"
          @click="generate"
        >
          {{ ticket ? '重新生成配对码' : '生成配对码' }}
        </v-btn>
      </template>
      <v-btn
        variant="text"
        :loading="busy"
        class="ml-2"
        @click="refresh"
      >
        刷新授权状态
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup>
import {ref, computed, onMounted, onUnmounted} from 'vue';
import {getClassroomScreenToken, npepScreenPairingApi} from '@/utils/classworksV2Client';
import {npepErrorMessage} from '@/utils/npepPresentation';
const status = ref(null), ticket = ref(null), error = ref(''), busy = ref(false), serverNow = ref(0);
let controller, disposed = false, requestId, serverAt = 0, receivedAt = 0;
const expired = computed(() => ticket.value && Date.parse(ticket.value.expiresAt) <= serverNow.value);
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
