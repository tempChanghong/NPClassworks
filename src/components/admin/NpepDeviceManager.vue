<template>
  <v-card class="npep-device-manager rounded-xl mt-4">
    <v-card-title class="d-flex align-center flex-wrap ga-2">
      NPEP 设备互联
      <v-spacer />
      <v-btn
        :loading="busy"
        variant="text"
        @click="refresh"
      >
        刷新互联设备
      </v-btn>
    </v-card-title>
    <v-card-text>
      <p class="mb-3">
        {{ schoolName }} · 仅查看 NPEduTools 状态，不能控制软件、切换模式或启动录制。
      </p>
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-3"
      >
        {{ error }}
      </v-alert>
      <v-alert
        v-if="message"
        type="success"
        variant="tonal"
        class="mb-3"
      >
        {{ message }}
      </v-alert>
      <v-alert
        v-if="stale"
        type="warning"
        variant="tonal"
        class="mb-3"
      >
        刷新未完成，以下为上次成功加载的记录，请勿视为实时状态。
      </v-alert>
      <v-row>
        <v-col
          cols="12"
          lg="4"
        >
          <h3 class="text-subtitle-1 mb-3">
            关联本地设备
          </h3>
          <p class="mb-3">
            先在大屏的 NPEduTools 中发起配对，将显示的短码输入这里。
          </p>
          <v-text-field
            v-model="code"
            label="8 位配对短码"
            maxlength="9"
            :disabled="busy || !!approved"
            autocomplete="off"
            variant="outlined"
          />
          <v-btn
            :disabled="busy || !!approved || !loaded"
            @click="resolve"
          >
            核对配对申请
          </v-btn>
          <div
            v-if="candidate"
            class="npep-candidate mt-4"
          >
            <p>申请设备：{{ candidate.deviceName }}</p>
            <p>软件版本：{{ candidate.appVersion }}</p>
            <p>申请到期：{{ time(candidate.expiresAt) }}</p>
            <v-alert
              v-if="expired"
              type="warning"
              variant="tonal"
              class="my-2"
            >
              申请已过期，请在设备上重新发起配对。
            </v-alert>
            <template v-if="!approved">
              <v-select
                v-model="bindingId"
                :items="bindingOptions"
                label="关联的大屏与班级"
                :disabled="busy || !!expired"
                variant="outlined"
                class="mt-3"
              />
              <p v-if="!bindingOptions.length">
                没有可用大屏，请先为当前学期的有效班级创建并启用大屏账号。
              </p>
              <v-checkbox
                v-model="confirmed"
                :disabled="busy || !!expired"
                label="已核对设备、学校和班级，仅授权查看状态"
                hide-details
              />
              <v-btn
                color="primary"
                :disabled="busy || !confirmed || !bindingId || !!expired"
                class="mt-2"
                @click="approve"
              >
                批准并等待现场确认
              </v-btn>
            </template>
            <template v-else>
              <p class="mt-3">
                {{ approved.schoolName }} · {{ approved.administrativeClassName }} · {{ approved.screenBindingName }}
              </p>
              <v-btn
                :disabled="busy || !!expired"
                variant="text"
                class="mt-2"
                @click="cancel"
              >
                取消此次配对
              </v-btn>
              <v-btn
                :disabled="busy"
                variant="text"
                class="mt-2"
                @click="newPairing"
              >
                核对另一台设备
              </v-btn>
            </template>
          </div>
        </v-col>
        <v-col
          cols="12"
          lg="8"
        >
          <h3 class="text-subtitle-1 mb-3">
            已登记的互联设备
          </h3>
          <p class="text-caption mb-3">
            点击“刷新互联设备”查询最新状态。“在线”表示查询时最近一分钟收到上报；观测过时后会提示刷新，不据此断言设备已离线。失联不代表软件已退出，自动录制已启用也不代表正在录制。
          </p>
          <p v-if="loaded && !devices.length && !stale">
            当前没有已登记的互联设备。
          </p>
          <v-card
            v-for="device in devices"
            :key="device.deviceId"
            variant="outlined"
            class="npep-device mb-3"
          >
            <v-card-text>
              <div class="d-flex align-center flex-wrap ga-2 mb-2">
                <strong>{{ device.deviceName }}</strong>
                <v-chip size="small">
                  {{ npepStateName(effectiveState(device)) }}
                </v-chip>
                <v-chip
                  size="small"
                  :color="connectivity(device) === '在线' ? 'success' : undefined"
                >
                  {{ connectivity(device) }}
                </v-chip>
              </div>
              <p>{{ bindingName(device) }}</p>
              <p>最近观测：{{ device.lastSeenAt ? time(device.lastSeenAt) : '尚未上报' }}</p>
              <p>授权到期：{{ time(device.credentialExpiresAt) }}</p>
              <p
                v-if="device.status"
                class="mt-2"
              >
                上次观测模式：{{ npepModeName(device.status.mode) }}；录制状态：{{ npepRecordingName(device.status.recording) }}；自动录制：{{ npepAutomaticName(device.status.automaticRecording) }}。
              </p>
              <p
                v-if="device.status"
                class="text-caption"
              >
                NPEduTools {{ device.status.appVersion }} · ClassIsland：{{ bridge(device.status.classIsland) }} · ExamAware：{{ bridge(device.status.examAware) }}
              </p>
              <v-btn
                v-if="device.state !== 'REVOKED'"
                :disabled="busy || stale"
                color="error"
                variant="text"
                class="mt-2"
                @click="revoking = device"
              >
                撤销互联授权
              </v-btn>
            </v-card-text>
          </v-card>
          <v-btn
            v-if="nextCursor"
            :disabled="busy || stale"
            @click="more"
          >
            加载更多互联设备
          </v-btn>
        </v-col>
      </v-row>
    </v-card-text>
    <v-dialog
      :model-value="!!revoking"
      max-width="520"
      :persistent="busy"
      @update:model-value="value => { if (!value && !busy) revoking = null; }"
    >
      <v-card
        v-if="revoking"
        title="撤销互联设备授权"
      >
        <v-card-text>
          <p>{{ schoolName }} · {{ revoking.deviceName }} · {{ bindingName(revoking) }}</p>
          <p class="mt-3">
            撤销后，这台 NPEduTools 不能继续上报状态，重新使用需要再次配对。网页大屏账号和 PIN 不受影响。
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            :disabled="busy"
            @click="revoking = null"
          >
            保留授权
          </v-btn>
          <v-btn
            color="error"
            :loading="busy"
            @click="confirmRevoke"
          >
            确认撤销互联授权
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import {ref, toRef, watch} from "vue";
import {useNpepManager} from "@/composables/admin/useNpepManager";
import {npepConnectivity, npepStateName, npepModeName, npepRecordingName, npepAutomaticName} from "@/utils/npepPresentation";

const props = defineProps({schoolId: {type: String, required: true}, schoolName: {type: String, default: "当前学校"}});
const manager = useNpepManager(toRef(props, "schoolId"));
const {devices, bindings, candidate, approved, code, bindingId, busy, error, message, loaded, stale, nextCursor, now,
  expired, bindingOptions, refresh, more, resolve, approve, cancel, revoke} = manager;
const confirmed = ref(false), revoking = ref(null);
watch([candidate, bindingId, () => props.schoolId], () => { confirmed.value = false; revoking.value = null; });
const time = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN") : "未知";
const effectiveState = device => device.state === "ACTIVE" && Date.parse(device.credentialExpiresAt) <= now.value ? "EXPIRED" : device.state;
const connectivity = device => stale.value ? "待刷新核对" : npepConnectivity({...device, state: effectiveState(device)}, now.value);
const bindingName = device => {
  const screen = bindings.value.find(b => b.id === device.screenBindingId);
  if (screen && device.administrativeClassId && screen.administrativeClassId !== device.administrativeClassId) return `${screen.name} · 原班级绑定已变化`;
  return screen ? `${screen.name} · ${screen.administrativeClass?.name || '班级资料暂缺'}` : "原大屏资料不可用";
};
const bridge = value => ({READY: "已连接", DISCONNECTED: "未连接", UNKNOWN: "未知"}[value?.connection] || "未知");
function newPairing() { candidate.value = null; approved.value = null; bindingId.value = ""; code.value = ""; message.value = ""; }
async function confirmRevoke() {
  const device = revoking.value;
  if (!device || busy.value) return;
  await revoke(device);
  revoking.value = null;
}
</script>

<style scoped>
.npep-device-manager { overflow-wrap: anywhere; }
.npep-device-manager p { line-height: 1.7; }
</style>
