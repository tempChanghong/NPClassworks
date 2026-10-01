<template>
  <h4 class="mb-2">
    本设备最近统计报告
  </h4>
  <p class="text-caption mb-3">
    KV 每台设备保留最近 30 天、最多 200 份；此处显示最近 20 份。旧网页历史仍留在原浏览器中。
  </p>
  <p v-if="!reports.length">
    尚无已上传的结束报告。监测结束并恢复连接后会补传。
  </p>
  <p
    v-else
    class="text-caption mb-3"
  >
    来源按会话记录核对；缺少记录不代表手动监测，记录稍后到达时会更新。
  </p>
  <v-card
    v-for="{report: r, source} in rows"
    :key="r.sessionId"
    tag="article"
    :aria-label="`统计报告 ${r.sessionId}`"
    variant="tonal"
    class="pa-3 mb-2"
  >
    <div class="d-flex align-center ga-2 mb-2">
      <v-chip
        size="small"
        :color="source ? 'primary' : undefined"
        variant="tonal"
      >
        {{ source ? '学校自动排程' : '来源未确认' }}
      </v-chip>
      <span
        v-if="source && currentVersion && source.version !== currentVersion"
        class="text-caption"
      >按当时规则执行，当前规则已更新</span>
    </div>
    <p
      v-if="source"
      class="text-body-2 mb-2"
    >
      学校时段：{{ schoolCalendarText(source.window.start) }} → {{ schoolCalendarText(source.window.end) }}
    </p>
    <p>{{ time(r.startedAt) }} → {{ time(r.endedAt) }} · {{ r.outcome === 'Stopped' ? '已结束' : r.outcome === 'Interrupted' ? '程序中断，部分统计' : '采集异常' }}</p>
    <p>有效采样 {{ r.summary.sampledSeconds.toFixed(1) }} 秒／{{ r.summary.elapsedSeconds.toFixed(1) }} 秒 · 覆盖率 {{ (r.summary.coverage * 100).toFixed(0) }}%</p>
    <p>能量平均 {{ db(r.summary.energyMeanDbfs) }} · 峰值 {{ db(r.summary.peakDbfs) }} · 削波 {{ r.summary.clippedPercent.toFixed(2) }}%</p>
    <p class="text-caption">
      {{ r.deviceName || '未打开设备' }} · {{ r.algorithm }} · {{ r.sessionId }}
    </p>
  </v-card>
</template>
<script setup>
import {computed} from 'vue';
import {time, statistic as db} from '@/utils/nativeNoisePresentation';
import {scheduledReportSource, schoolCalendarText} from '@/utils/noiseReportSources';
const props = defineProps({reports: {type: Array, default: () => []}, sessions: {type: Array, default: () => []}, currentVersion: {type: String, default: ''}});
const rows = computed(() => props.reports.map(report => ({report, source: scheduledReportSource(report.sessionId, props.sessions)})));
</script>
