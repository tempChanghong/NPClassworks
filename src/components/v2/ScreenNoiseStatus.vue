<template>
  <v-alert
    v-if="state.manualActive || state.scheduledActive || state.manualExpired"
    class="screen-noise-status mt-3"
    :type="state.manualExpired || failed ? 'warning' : 'info'"
    variant="tonal"
    density="compact"
  >
    <div class="d-flex flex-wrap align-center ga-2">
      <span>{{ label }}</span>
      <v-spacer />
      <v-btn
        size="small"
        variant="text"
        @click="$emit('open')"
      >
        查看噪声监测
      </v-btn>
      <v-btn
        v-if="state.manualActive"
        size="small"
        variant="tonal"
        @click="noiseMonitoring.stopManual()"
      >
        停止手动监测
      </v-btn>
      <v-btn
        v-if="state.manualExpired"
        size="small"
        variant="text"
        @click="noiseMonitoring.dismissExpiry()"
      >
        知道了
      </v-btn>
    </div>
  </v-alert>
</template>

<script setup>
import {computed} from "vue";
import {noiseMonitoring, noiseMonitoringState as state} from "@/utils/noiseMonitoring";
defineEmits(["open"]);
const failed = computed(() => ["error", "permission-denied", "unavailable"].includes(state.value.status));
const label = computed(() => {
  const value = state.value;
  if (value.manualExpired) return value.scheduledActive
    ? `手动监测已满三小时，手动模式已结束；${failed.value ? '定时监测异常，请查看详情。' : `定时监测继续至 ${value.scheduledEndTime}。`}`
    : "手动监测已满三小时，已自动停止。";
  const mode = value.manualActive ? (value.scheduledActive ? "手动＋定时" : "手动") : "定时";
  const status = failed.value ? "噪声监测异常，请查看详情" : value.status === "initializing" ? "正在启动噪声监测"
    : value.status === "active" ? "噪声监测中" : "噪声监测已暂停";
  const end = value.manualActive
    ? `手动最晚 ${new Intl.DateTimeFormat('zh-CN', {hour: '2-digit', minute: '2-digit'}).format(value.manualEndsAt)} 结束`
    : `${value.scheduledEndTime} 结束`;
  return `${status} · ${mode} · ${end}`;
});
</script>
