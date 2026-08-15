<template>
  <span
    aria-hidden="true"
    class="noise-schedule-manager"
  />
</template>

<script setup>
import {onMounted, onUnmounted, watch} from "vue";
import {noiseService} from "@/utils/noiseService";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {loadClassroomToolSettings} from "@/utils/classroomToolSettings";
import {
  isWithinNoiseSchedule,
  loadNoiseScheduleSettings,
  noiseScheduleSettingsKey,
  noiseScheduleWindowKey,
  NOISE_SCHEDULE_SETTINGS_EVENT,
} from "@/utils/noiseScheduleSettings";

const store = useClassworksV2Store();
let timer = null;
let unsubscribe = null;
let serviceStatus = "paused";
let scheduleOwnsService = false;
let attemptedWindowKey = "";
let evaluationPending = false;

function currentBindingId() {
  return store.screenSession?.binding?.id || "";
}

async function evaluateSchedule({retry = false} = {}) {
  if (evaluationPending) return;
  evaluationPending = true;
  try {
    const bindingId = currentBindingId();
    const schedule = loadNoiseScheduleSettings(bindingId);
    const noiseToolEnabled = bindingId
      && loadClassroomToolSettings(bindingId).enabledToolIds.includes("noise");
    const shouldRun = Boolean(noiseToolEnabled && isWithinNoiseSchedule(schedule));

    if (!shouldRun) {
      attemptedWindowKey = "";
      if (scheduleOwnsService && serviceStatus !== "paused") noiseService.stop();
      scheduleOwnsService = false;
      return;
    }

    scheduleOwnsService = true;
    if (["active", "initializing"].includes(serviceStatus)) return;

    const windowKey = noiseScheduleWindowKey(schedule);
    if (!retry
      && attemptedWindowKey === windowKey
      && ["permission-denied", "error"].includes(serviceStatus)) return;
    attemptedWindowKey = windowKey;
    await noiseService.start();
  } finally {
    evaluationPending = false;
  }
}

function handleScheduleChange(event) {
  if (event.detail?.bindingId && event.detail.bindingId !== currentBindingId()) return;
  attemptedWindowKey = "";
  void evaluateSchedule({retry: true});
}

function handleStorage(event) {
  const bindingId = currentBindingId();
  if (!bindingId || event.key !== noiseScheduleSettingsKey(bindingId)) return;
  attemptedWindowKey = "";
  void evaluateSchedule({retry: true});
}

watch(() => store.screenSession?.binding?.id, () => {
  attemptedWindowKey = "";
  void evaluateSchedule({retry: true});
});

onMounted(() => {
  unsubscribe = noiseService.subscribe((snapshot) => {
    serviceStatus = snapshot.status;
  });
  window.addEventListener(NOISE_SCHEDULE_SETTINGS_EVENT, handleScheduleChange);
  window.addEventListener("storage", handleStorage);
  timer = window.setInterval(evaluateSchedule, 15 * 1000);
  void evaluateSchedule();
});

onUnmounted(() => {
  unsubscribe?.();
  window.removeEventListener(NOISE_SCHEDULE_SETTINGS_EVENT, handleScheduleChange);
  window.removeEventListener("storage", handleStorage);
  window.clearInterval(timer);
});
</script>

<style scoped>
.noise-schedule-manager { display: none; }
</style>
