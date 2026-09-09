<template>
  <span
    aria-hidden="true"
    class="noise-schedule-manager"
  />
</template>

<script setup>
import {onMounted, onUnmounted, watch} from "vue";
import {noiseMonitoring} from "@/utils/noiseMonitoring";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {loadClassroomToolSettings, classroomToolSettingsKey, CLASSROOM_TOOLS_SETTINGS_EVENT} from "@/utils/classroomToolSettings";
import {loadMicrophoneDeviceSettings} from "@/utils/microphoneDeviceSettings";
import {getClassroomScreenToken} from "@/utils/classworksV2Client";
import {getServerUrl} from "@/utils/socketClient";
import {screenExitState} from "@/utils/screenTemporaryExit";
import {
  loadNoiseScheduleSettings, noiseScheduleSettingsKey, noiseScheduleWindowKey, NOISE_SCHEDULE_SETTINGS_EVENT,
} from "@/utils/noiseScheduleSettings";

const store = useClassworksV2Store();
let timer = null;
let detach = null;

function readContext() {
  const binding = store.screenSession?.binding;
  const bindingId = binding?.id || "";
  const schedule = loadNoiseScheduleSettings(bindingId);
  return {
    bindingId,
    scopeKey: `${getServerUrl()}:${bindingId}:${binding?.credentialVersion || 1}:${getClassroomScreenToken()}`,
    enabled: Boolean(bindingId && !screenExitState.value.unlocked
      && loadClassroomToolSettings(bindingId).enabledToolIds.includes("noise")),
    scheduleKey: noiseScheduleWindowKey(schedule),
    endTime: schedule.endTime,
    deviceId: loadMicrophoneDeviceSettings(bindingId).deviceId,
  };
}
function evaluate() { noiseMonitoring.tick(); }
function handleScheduleChange(event) {
  if (event.detail?.bindingId && event.detail.bindingId !== store.screenSession?.binding?.id) return;
  noiseMonitoring.tick({retry: true});
}
function handleStorage(event) {
  const id = store.screenSession?.binding?.id;
  if (event.key === null || [noiseScheduleSettingsKey(id), classroomToolSettingsKey(id)].includes(event.key)) {
    noiseMonitoring.tick({retry: true});
  }
}
watch(() => [store.screenSession?.binding?.id, store.screenSession?.binding?.credentialVersion, screenExitState.value.unlocked],
  evaluate, {flush: "sync"});

onMounted(() => {
  detach = noiseMonitoring.attach(readContext);
  window.addEventListener(NOISE_SCHEDULE_SETTINGS_EVENT, handleScheduleChange);
  window.addEventListener(CLASSROOM_TOOLS_SETTINGS_EVENT, handleScheduleChange);
  window.addEventListener("storage", handleStorage);
  window.addEventListener("focus", evaluate);
  window.addEventListener("pageshow", evaluate);
  document.addEventListener("visibilitychange", evaluate);
  timer = window.setInterval(evaluate, 15 * 1000);
});
onUnmounted(() => {
  window.removeEventListener(NOISE_SCHEDULE_SETTINGS_EVENT, handleScheduleChange);
  window.removeEventListener(CLASSROOM_TOOLS_SETTINGS_EVENT, handleScheduleChange);
  window.removeEventListener("storage", handleStorage);
  window.removeEventListener("focus", evaluate);
  window.removeEventListener("pageshow", evaluate);
  document.removeEventListener("visibilitychange", evaluate);
  window.clearInterval(timer);
  detach?.();
});
</script>

<style scoped>
.noise-schedule-manager { display: none; }
</style>
