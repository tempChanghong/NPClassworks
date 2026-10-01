<template>
  <v-card
    title="原生噪音报告"
    class="pa-3"
  >
    <v-card-text>
      <p class="mb-3">
        {{ deviceName }} · 仅包含统计数据，不含原始音频。
      </p>
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
        :sessions="schedule?.sessions || []"
        :current-version="schedule?.policy?.version || ''"
      />
    </v-card-text>
    <v-card-actions>
      <v-btn
        :loading="busy"
        @click="refresh"
      >
        刷新报告
      </v-btn>
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
const reports = ref([]), error = ref(''), busy = ref(false);
const schedule=ref(null), scheduleError=ref('');
let generation = 0;
async function refresh() {
  const current = ++generation;
  busy.value = true; error.value = '';
  try {
    const result = await npepNoiseApi.management(props.schoolId, props.deviceId);
    if (current === generation) reports.value = result.data.reports;
    try {
      const observed=await npepNoiseScheduleApi.management(props.schoolId,props.deviceId);
      if(current===generation) {schedule.value=observed.data;scheduleError.value='';}
    } catch(e) {if(current===generation) {scheduleError.value=`排程状态未确认：${e?.response?.data?.error?.code||e.message}`;schedule.value=null;}}
  } catch (e) { if (current === generation) error.value = `报告加载失败：${e?.response?.data?.error?.code || e.message}`; }
  finally { if (current === generation) busy.value = false; }
}
watch(() => [props.schoolId, props.deviceId], () => { reports.value = []; schedule.value=null; scheduleError.value=''; void refresh(); }, {immediate: true});
onUnmounted(() => { generation++; });
</script>
