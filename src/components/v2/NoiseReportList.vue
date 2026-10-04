<template>
  <section
    class="noise-report-list"
    aria-label="本设备最近统计报告"
  >
    <div class="noise-report-heading">
      <h4>本设备最近统计报告</h4>
      <p>此处显示最近 20 份结束报告；KV 每台设备保留最近 30 天、最多 200 份。旧网页历史仍在原浏览器中。</p>
    </div>
    <p
      v-if="!loaded"
      class="noise-report-empty"
    >
      报告尚未完成加载，请刷新后再核对。
    </p>
    <p
      v-else-if="!reports.length"
      class="noise-report-empty"
    >
      尚无已上传的结束报告。监测结束并恢复连接后会补传。
    </p>
    <p
      v-else
      class="noise-report-note"
    >
      来源按会话记录核对；缺少记录不代表手动监测，记录稍后到达时会更新。
    </p>
    <v-card
      v-for="{report: r, source} in rows"
      :key="r.sessionId"
      tag="article"
      :aria-label="'统计报告 ' + r.sessionId"
      variant="outlined"
      class="noise-report-card mb-3"
    >
      <v-card-text>
        <div class="noise-report-top">
          <div>
            <strong>{{ time(r.startedAt) }} → {{ time(r.endedAt) }}</strong>
            <p>{{ r.outcome === 'Stopped' ? '已结束' : r.outcome === 'Interrupted' ? '程序中断，部分统计' : '采集异常' }}</p>
          </div>
          <v-chip
            size="small"
            :color="source ? 'primary' : undefined"
            variant="tonal"
          >
            {{ source ? '学校自动排程' : '来源未确认' }}
          </v-chip>
        </div>
        <p
          v-if="source && currentVersion && source.version !== currentVersion"
          class="noise-report-note mt-3"
        >
          按当时规则执行，当前规则已更新。
        </p>
        <p
          v-if="source"
          class="noise-report-window"
        >
          学校时段：{{ schoolCalendarText(source.window.start) }} → {{ schoolCalendarText(source.window.end) }}
        </p>
        <div class="noise-report-metrics">
          <div>
            <span>有效采样</span>
            <strong>{{ r.summary.sampledSeconds.toFixed(1) }} 秒</strong>
            <small>总时长 {{ r.summary.elapsedSeconds.toFixed(1) }} 秒</small>
          </div>
          <div>
            <span>覆盖率</span>
            <strong>{{ (r.summary.coverage * 100).toFixed(0) }}%</strong>
          </div>
          <div>
            <span>能量平均</span>
            <strong>{{ db(r.summary.energyMeanDbfs) }}</strong>
          </div>
          <div>
            <span>峰值</span>
            <strong>{{ db(r.summary.peakDbfs) }}</strong>
          </div>
        </div>
        <details class="noise-report-details">
          <summary>查看采集与诊断信息</summary>
          <p>削波 {{ r.summary.clippedPercent.toFixed(2) }}%</p>
          <p>麦克风：{{ r.deviceName || '未打开设备' }}</p>
          <p>算法：{{ r.algorithm }}</p>
          <p>会话编号：{{ r.sessionId }}</p>
        </details>
      </v-card-text>
    </v-card>
  </section>
</template>
<script setup>
import {computed} from 'vue';
import {time, statistic as db} from '@/utils/nativeNoisePresentation';
import {scheduledReportSource, schoolCalendarText} from '@/utils/noiseReportSources';
const props = defineProps({reports: {type: Array, default: () => []}, sessions: {type: Array, default: () => []}, currentVersion: {type: String, default: ''}, loaded: {type: Boolean, default: true}});
const rows = computed(() => props.reports.map(report => ({report, source: scheduledReportSource(report.sessionId, props.sessions)})));
</script>
<style scoped>
.noise-report-heading h4 { font-size: 19px; font-weight: 750; }
.noise-report-heading p, .noise-report-note { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.noise-report-heading p { margin-top: 4px; }
.noise-report-note { margin: 12px 0; }
.noise-report-empty { margin-top: 14px; padding: 20px; border: 1px dashed rgba(var(--v-border-color), .28); border-radius: 12px; }
.noise-report-card { border-color: rgba(var(--v-border-color), .2) !important; }
.noise-report-top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; }
.noise-report-top strong { font-size: 16px; }
.noise-report-top p { margin-top: 3px; color: rgba(var(--v-theme-on-surface), .7); font-size: 13px; }
.noise-report-window { margin-top: 12px; font-size: 13px; }
.noise-report-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
.noise-report-metrics > div { display: grid; gap: 3px; min-width: 0; padding: 12px; border-radius: 12px; background: rgba(var(--v-theme-on-surface), .045); }
.noise-report-metrics span, .noise-report-metrics small { color: rgba(var(--v-theme-on-surface), .68); font-size: 12px; }
.noise-report-metrics strong { font-size: 16px; overflow-wrap: anywhere; }
.noise-report-details { margin-top: 14px; }
.noise-report-details summary { color: rgb(var(--v-theme-primary)); cursor: pointer; font-weight: 700; }
.noise-report-details p { margin-top: 8px; overflow-wrap: anywhere; font-size: 13px; }
@media (max-width: 600px) { .noise-report-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
