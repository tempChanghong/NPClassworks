<template>
  <v-card class="noise-admin-card rounded-xl">
    <v-card-title class="noise-admin-header">
      <div>
        <span class="noise-admin-eyebrow">设备观测 · NPEP</span>
        <h2>原生噪音报告</h2>
        <p>{{ deviceName }} · 仅包含统计数据，不含原始音频。</p>
      </div>
      <v-btn
        :loading="busy"
        variant="tonal"
        prepend-icon="mdi-refresh"
        @click="refresh"
      >
        刷新报告
      </v-btn>
    </v-card-title>
    <v-card-text class="noise-admin-content">
      <v-alert
        v-if="error"
        type="warning"
        variant="tonal"
        class="mb-3"
      >
        {{ error }}
      </v-alert>
      <NoiseScheduleStatus
        :value="schedule"
        :error="scheduleError"
      />
      <NoiseReportList
        :reports="reports"
        :loaded="reportsLoaded"
        :sessions="schedule?.sessions || []"
        :current-version="schedule?.policy?.version || ''"
      />
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn @click="$emit('close')">
        关闭
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
<script setup>
import {ref, watch, onUnmounted} from 'vue';
import {npepNoiseApi, npepNoiseScheduleApi} from '@/utils/classworksV2Client';
import NoiseReportList from '@/components/v2/NoiseReportList.vue';
import NoiseScheduleStatus from '@/components/v2/NoiseScheduleStatus.vue';
const props = defineProps({schoolId: {type: String, required: true}, deviceId: {type: String, required: true}, deviceName: {type: String, default: ''}});
defineEmits(['close']);
const reports = ref([]), error = ref(''), busy = ref(false), reportsLoaded = ref(false);
const schedule=ref(null), scheduleError=ref('');
let generation = 0;
async function refresh() {
  const current = ++generation;
  busy.value = true; error.value = '';
  try {
    const [reportResult, scheduleResult] = await Promise.allSettled([
      npepNoiseApi.management(props.schoolId, props.deviceId),
      npepNoiseScheduleApi.management(props.schoolId, props.deviceId),
    ]);
    if (current !== generation) return;
    if (reportResult.status === 'fulfilled') {
      reports.value = reportResult.value.data.reports;
      reportsLoaded.value = true;
    } else {
      const failure = reportResult.reason;
      error.value = `报告加载失败：${failure?.response?.data?.error?.code || failure.message}${reportsLoaded.value ? '。以下为上次成功加载的报告，请勿视为实时状态' : ''}`;
    }
    if (scheduleResult.status === 'fulfilled') {
      schedule.value = scheduleResult.value.data;
      scheduleError.value = '';
    } else {
      const failure = scheduleResult.reason;
      scheduleError.value = `排程状态未确认：${failure?.response?.data?.error?.code || failure.message}`;
      schedule.value = null;
    }
  } finally { if (current === generation) busy.value = false; }
}
watch(() => [props.schoolId, props.deviceId], () => { reports.value = []; reportsLoaded.value = false; schedule.value=null; scheduleError.value=''; void refresh(); }, {immediate: true});
onUnmounted(() => { generation++; });
</script>
<style scoped>
.noise-admin-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 26px 28px 18px; white-space: normal; }
.noise-admin-eyebrow { color: rgb(var(--v-theme-primary)); font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.noise-admin-header h2 { margin-top: 5px; font-size: clamp(24px, 2vw, 30px); font-weight: 750; }
.noise-admin-header p { margin-top: 5px; color: rgba(var(--v-theme-on-surface), .7); font-size: 14px; }
.noise-admin-content { padding: 0 28px 24px !important; }
@media (max-width: 600px) {
  .noise-admin-header { padding: 20px 18px 16px; }
  .noise-admin-content { padding: 0 18px 18px !important; }
}
</style>
