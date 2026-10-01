<template>
  <v-card
    rounded="xl"
    variant="outlined"
    class="pa-5"
  >
    <h3 class="mb-3">
      NPEduTools 原生噪音监测
    </h3>
    <v-alert
      type="info"
      variant="tonal"
      class="mb-4"
    >
      麦克风由 NPEduTools 使用。网页不重复采集；自动时段由学校设置、桌面按 ClassIsland 时间执行。
      仅上传统计，不上传录音。关闭网页后继续监测，手动监测最多三小时。
    </v-alert>
    <v-alert
      v-if="state.error || !state.online"
      type="warning"
      variant="tonal"
      class="mb-3"
    >
      {{ state.error || '正在连接原生监测；当前状态未知。' }}
    </v-alert>
    <div class="d-flex align-center ga-4 mb-3">
      <strong class="text-h3">{{ state.online ? level(state.status?.currentDbfs) : '—' }}</strong>
      <span>dBFS 信号电平</span>
      <v-chip>{{ state.online ? stateName(state.status?.state) : '未知／离线' }}</v-chip>
    </div>
    <p>采样质量：{{ !state.online ? '未知' : ['Stopped', 'Faulted'].includes(state.status?.state) ? '已结束' : qualityName(state.status?.quality, state.status?.currentDbfs) }} · {{ state.status?.deviceName || '请在 NPEduTools 保存麦克风' }}</p>
    <p
      v-if="hint"
      class="text-body-2 my-2"
    >
      {{ hint }}
    </p>
    <p class="text-caption mb-4">
      最近上报：{{ time(state.receivedAt) }}。此值有网络延迟，不是实际声压级，也不与旧网页评分混用。
    </p>
    <p
      v-if="state.status?.uploadError"
      class="text-error"
    >
      统计存储异常：{{ state.status.uploadError }}；请检查本机磁盘并重启后台。
    </p>
    <div class="d-flex ga-3 mb-4">
      <v-btn
        color="primary"
        :disabled="!state.online || !state.status?.configured || active || pending || state.busy"
        @click="nativeNoise.command('START')"
      >
        开始监测
      </v-btn>
      <v-btn
        :disabled="!state.online || !active || pending || state.busy"
        @click="nativeNoise.command('STOP')"
      >
        停止监测
      </v-btn>
      <v-btn
        variant="text"
        @click="nativeNoise.poll()"
      >
        刷新
      </v-btn>
    </div>
    <p
      v-if="lastCommand"
      class="mb-3"
    >
      最近请求：{{ lastCommand.command.action === 'START' ? '开始' : '停止' }} ·
      {{ lastCommand.receipt ? receiptName(lastCommand.receipt.outcome) : '等待桌面回执' }}
      {{ lastCommand.receipt?.reason || '' }}
    </p>
    <NoiseScheduleStatus
      :value="state.schedule"
      :error="state.scheduleError"
      allow-resume
      :busy="state.busy"
      @resume="nativeNoise.resumeSchedule()"
    />
    <NoiseReportList
      :reports="state.reports || []"
      :sessions="state.schedule?.sessions || []"
      :current-version="state.schedule?.policy?.version || ''"
    />
  </v-card>
</template>
<script setup>
import {computed} from 'vue';
import {nativeNoise, nativeNoiseState as state} from '@/utils/nativeNoise';
import {stateName, qualityName, receiptName, time, level, signalHint} from '@/utils/nativeNoisePresentation';
import NoiseReportList from '@/components/v2/NoiseReportList.vue';
import NoiseScheduleStatus from '@/components/v2/NoiseScheduleStatus.vue';
const active = computed(() => ['Starting', 'Active', 'Stopping'].includes(state.value.status?.state));
const pending = computed(() => state.value.commands?.some(c => !c.receipt));
const lastCommand = computed(() => state.value.commands?.at(-1));
const hint = computed(() => state.value.online && state.value.status?.state === 'Active' && state.value.status?.quality === 'Good'
  ? signalHint(state.value.status.currentDbfs) : '');
</script>
