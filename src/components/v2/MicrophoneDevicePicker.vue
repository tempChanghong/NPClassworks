<template>
  <div class="microphone-picker">
    <div class="microphone-picker__controls">
      <v-select
        v-model="selectedDeviceId"
        :disabled="busy"
        hide-details
        item-title="title"
        item-value="value"
        label="噪声监测麦克风"
        :items="deviceOptions"
        prepend-inner-icon="mdi-microphone-outline"
        variant="outlined"
      />
      <v-btn
        :disabled="busy"
        icon="mdi-refresh"
        title="重新扫描麦克风"
        variant="tonal"
        @click="refreshDevices(true)"
      />
    </div>

    <div class="microphone-picker__actions">
      <v-btn
        :loading="testing"
        prepend-icon="mdi-waveform"
        variant="tonal"
        @click="testSelectedDevice"
      >
        测试所选麦克风
      </v-btn>
      <v-btn
        :disabled="busy || !selectionChanged"
        color="primary"
        prepend-icon="mdi-content-save-check-outline"
        @click="saveSelection"
      >
        保存并使用
      </v-btn>
    </div>

    <v-alert
      v-if="statusMessage"
      class="mt-3"
      density="compact"
      :type="statusType"
      variant="tonal"
    >
      {{ statusMessage }}
      <div
        v-if="testLevel !== null"
        class="microphone-picker__meter mt-2"
      >
        <span :style="{width: `${testLevel}%`}" />
      </div>
    </v-alert>
    <p class="microphone-picker__hint">
      测试持续约 1.5 秒。请在测试时说话或拍手；虚拟麦克风若没有信号，会显示为“近似无输入”。
    </p>
  </div>
</template>

<script setup>
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {noiseService} from "@/utils/noiseService";
import {classifyMicrophoneError, microphonePermissionLabel} from "@/utils/microphonePermission";
import {
  listMicrophoneDevices,
  loadMicrophoneDeviceSettings,
  saveMicrophoneDeviceSettings,
} from "@/utils/microphoneDeviceSettings";

const props = defineProps({
  bindingId: {type: String, required: true},
});
const emit = defineEmits(["saved", "permission"]);

const devices = ref([]);
const selectedDeviceId = ref("default");
const savedDeviceId = ref("default");
const scanning = ref(false);
const testing = ref(false);
const statusMessage = ref("");
const statusType = ref("info");
const testLevel = ref(null);
const busy = computed(() => scanning.value || testing.value);
const selectionChanged = computed(() => selectedDeviceId.value !== savedDeviceId.value);
const deviceOptions = computed(() => {
  const seen = new Set();
  const options = [{title: "系统默认麦克风", value: "default"}];
  for (const [index, device] of devices.value.entries()) {
    if (!device.deviceId || seen.has(device.deviceId) || device.deviceId === "default") continue;
    seen.add(device.deviceId);
    options.push({
      title: device.label || `麦克风 ${index + 1}`,
      value: device.deviceId,
    });
  }
  if (selectedDeviceId.value && !options.some(option => option.value === selectedDeviceId.value)) {
    options.push({title: "上次选择的麦克风（当前未检测到）", value: selectedDeviceId.value});
  }
  return options;
});

watch(() => props.bindingId, loadSelection, {immediate: true});

onMounted(() => {
  void refreshDevices(false);
  navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
});

onBeforeUnmount(() => {
  navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
});

function loadSelection() {
  const settings = loadMicrophoneDeviceSettings(props.bindingId);
  selectedDeviceId.value = settings.deviceId;
  savedDeviceId.value = settings.deviceId;
}

function handleDeviceChange() {
  void refreshDevices(false);
}

async function refreshDevices(requestPermission) {
  scanning.value = true;
  testLevel.value = null;
  const result = await listMicrophoneDevices({requestPermission});
  scanning.value = false;
  if (result.state === "granted") {
    devices.value = result.devices;
    statusType.value = result.devices.length ? "info" : "warning";
    statusMessage.value = result.devices.length
      ? `检测到 ${result.devices.length} 个麦克风输入设备。`
      : "没有检测到麦克风输入设备。";
    if (requestPermission) emit("permission", "granted");
    return;
  }
  const state = classifyMicrophoneError(result.error, {secureContext: window.isSecureContext});
  statusType.value = "warning";
  statusMessage.value = microphonePermissionLabel(state);
  emit("permission", state);
}

async function testSelectedDevice() {
  testing.value = true;
  testLevel.value = null;
  statusType.value = "info";
  statusMessage.value = "正在采样，请对着麦克风说话或拍手……";
  try {
    const result = await noiseService.testMicrophoneDevice(selectedDeviceId.value);
    emit("permission", "granted");
    const displayDbfs = Math.max(-100, Math.min(0, result.dbfs));
    testLevel.value = Math.round(Math.max(2, Math.min(100, (displayDbfs + 80) / 0.8)));
    const labels = {
      working: ["success", `输入正常：${result.label}，峰值约 ${result.dbfs.toFixed(1)} dBFS。`],
      weak: ["warning", `检测到较弱输入：${result.label}，峰值约 ${result.dbfs.toFixed(1)} dBFS。请靠近后再试一次。`],
      silent: ["error", `近似无输入：${result.label}。它可能是不可用的虚拟麦克风，请选择其他设备。`],
    };
    [statusType.value, statusMessage.value] = labels[result.state];
  } catch (error) {
    const state = classifyMicrophoneError(error, {secureContext: window.isSecureContext});
    statusType.value = "error";
    statusMessage.value = microphonePermissionLabel(state);
  } finally {
    testing.value = false;
  }
}

async function saveSelection() {
  const settings = saveMicrophoneDeviceSettings(props.bindingId, {deviceId: selectedDeviceId.value});
  savedDeviceId.value = settings.deviceId;
  const selectedOption = deviceOptions.value.find(option => option.value === settings.deviceId);
  await noiseService.setMicrophoneDevice(settings.deviceId, {
    restart: true,
    label: selectedOption?.title || "",
  });
  statusType.value = "success";
  statusMessage.value = "已保存；后续自动监测将使用这个麦克风。";
  emit("saved", settings);
}
</script>

<style scoped>
.microphone-picker { min-width: min(100%, 520px); }
.microphone-picker__controls { align-items: center; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) auto; }
.microphone-picker__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.microphone-picker__hint { color: rgba(var(--v-theme-on-surface), 0.62); font-size: 0.8rem; line-height: 1.5; margin: 10px 0 0; }
.microphone-picker__meter { background: rgba(var(--v-theme-on-surface), 0.12); border-radius: 999px; height: 8px; overflow: hidden; }
.microphone-picker__meter span { background: rgb(var(--v-theme-primary)); border-radius: inherit; display: block; height: 100%; transition: width 160ms ease; }

@media (max-width: 600px) {
  .microphone-picker__actions .v-btn { flex: 1 1 100%; }
}
</style>
