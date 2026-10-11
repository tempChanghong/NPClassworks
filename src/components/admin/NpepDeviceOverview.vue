<template>
  <section
    class="device-operations mb-6"
    aria-labelledby="npep-operations-title"
  >
    <div class="operations-heading">
      <div>
        <h3 id="npep-operations-title">
          学校运维概览
        </h3>
        <p>本校全部登记设备 · 包含历史非授权登记</p>
      </div>
      <div>
        <span
          class="operations-time"
          role="status"
        >{{ outdated ? '观测已过时，请刷新' : '观测于' }} {{ time(asOf) }}</span>
        <v-btn
          class="ml-2"
          variant="text"
          size="small"
          prepend-icon="mdi-download-outline"
          :disabled="busy"
          @click="$emit('export')"
        >
          导出诊断摘要
        </v-btn>
      </div>
    </div>
    <div class="operations-metrics">
      <button
        v-for="metric in metrics"
        :key="metric.filter"
        type="button"
        :class="['operations-metric', {selected: filter === metric.filter}]"
        :disabled="busy"
        :aria-pressed="filter === metric.filter"
        @click="$emit('filter', metric.filter)"
      >
        <span>{{ metric.label }}</span><strong>{{ summary[metric.key] }}</strong>
        <small>{{ metric.detail }}</small>
      </button>
    </div>
    <p class="operations-explanation">
      仍在授权 {{ summary.active }} 台；失联 {{ summary.offline }} 台；尚未上报 {{ summary.unreported }} 台。
      待检查不等于执行失败；仅按最近上报定位需要核对的设备。
    </p>
    <form
      class="operations-search"
      @submit.prevent="$emit('search')"
    >
      <v-text-field
        :model-value="search"
        label="搜索设备、班级或大屏名称"
        maxlength="100"
        clearable
        hide-details
        variant="outlined"
        density="comfortable"
        :disabled="busy"
        @update:model-value="$emit('update:search', $event || '')"
      />
      <v-btn
        type="submit"
        :disabled="busy"
        variant="tonal"
        prepend-icon="mdi-magnify"
      >
        搜索
      </v-btn>
    </form>
    <p class="operations-explanation">
      筛选：{{ filterNames[filter] }} · 共 {{ matchedTotal }} 台匹配，已加载 {{ loadedCount }} 台。
      搜索和分页不改变上方全校计数。{{ outdated ? '以上为旧快照，刷新后再操作设备。' : '计数为查询时观测，失联不代表软件已退出。' }}
    </p>
    <p class="operations-explanation">
      诊断摘要只包含已加载设备的状态与归属编号（最多 200 台），不含名称、配对码或凭据。分享前请核对文件；不会自动上传。
    </p>
  </section>
</template>

<script setup>
import {computed} from 'vue';

const props = defineProps({summary: {type: Object, required: true}, asOf: {type: String, required: true},
  now: {type: Number, required: true}, stale: Boolean, busy: Boolean,
  filter: {type: String, required: true}, search: {type: String, default: ''},
  matchedTotal: {type: Number, required: true}, loadedCount: {type: Number, required: true}});
defineEmits(['filter', 'search', 'update:search', 'export']);
const filterNames = {ALL: '全部登记', ATTENTION: '待检查', ONLINE: '在线', INACTIVE: '非授权登记'};
const outdated = computed(() => props.stale || props.now - Date.parse(props.asOf) > 60000);
const metrics = [
  {filter: 'ALL', key: 'total', label: '全部登记', detail: '当前与历史设备'},
  {filter: 'ONLINE', key: 'online', label: '在线', detail: '一分钟内收到上报'},
  {filter: 'ATTENTION', key: 'attention', label: '待检查', detail: '连接或运行状态需核对'},
  {filter: 'INACTIVE', key: 'inactive', label: '非授权登记', detail: '撤销、过期或绑定失效'},
];
const time = value => new Date(value).toLocaleString('zh-CN');
</script>

<style scoped>
.device-operations { padding: 20px; border: 1px solid rgba(var(--v-border-color), .18); border-radius: 16px; background: rgba(var(--v-theme-primary), .025); }
.operations-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 16px; }
.operations-heading h3 { font-size: 21px; font-weight: 750; }
.operations-heading p, .operations-time, .operations-explanation { color: rgba(var(--v-theme-on-surface), .7); font-size: 13px; line-height: 1.7; }
.operations-time { max-width: 100%; }
.operations-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.operations-metric { display: flex; flex-direction: column; align-items: flex-start; padding: 16px; text-align: start; color: rgb(var(--v-theme-on-surface)); border: 1px solid rgba(var(--v-border-color), .2); border-radius: 12px; background: rgb(var(--v-theme-surface)); }
.operations-metric strong { font-size: 32px; line-height: 1.4; font-variant-numeric: tabular-nums; }
.operations-metric small { opacity: .7; }
.operations-metric.selected { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .08); }
.operations-metric:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 3px; }
.operations-metric:disabled { opacity: .6; cursor: wait; }
.operations-search { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.operations-explanation { margin-top: 12px; }
@media (max-width: 700px) {
  .operations-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .device-operations { padding: 14px; }
  .operations-metric { padding: 12px; }
}
@media (max-width: 430px) {
  .operations-search { flex-direction: column; align-items: stretch; }
}
</style>
