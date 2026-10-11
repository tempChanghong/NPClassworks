<template>
  <section
    class="study-device-status my-4"
    aria-label="自习配置应用回执"
  >
    <div class="d-flex flex-wrap align-center ga-3 mb-2">
      <strong>自习配置与执行回执</strong>
      <v-btn
        size="small"
        variant="tonal"
        :loading="busy"
        @click="refresh"
      >
        刷新自习应用回执
      </v-btn>
      <v-chip
        v-if="data"
        size="small"
        :color="applied ? 'primary' : undefined"
      >
        {{ applied ? '自习配置已应用' : data.observation ? '回执待重新确认' : '尚无设备回执' }}
      </v-chip>
    </div>
    <v-alert
      v-if="error"
      type="warning"
      variant="tonal"
      class="my-2"
    >
      {{ error }}
    </v-alert>
    <p v-if="!data">
      尚未读取该设备的自习回执。
    </p>
    <template v-else>
      <p>当前规则来源：{{ source }}。</p>
      <p v-if="data.observation && (!fresh || !currentVersion)">
        {{ !currentVersion ? '该回执对应旧配置，当前配置尚待设备应用。' : '以下为历史回执，请刷新；不能据此判断当前执行状态。' }}
      </p>
      <p v-if="data.observation">
        {{ fresh && currentVersion ? '最近计算阶段' : '上次计算阶段' }}：{{ phase }}；当次学校时间{{ data.observation.clockReady ? '已确认' : '待同步' }}。
      </p>
      <p v-if="!data.execution">
        本自习策略：尚无采集执行回执。
      </p>
      <template v-else>
        <v-chip
          class="study-capture-status my-1"
          size="small"
          :color="collecting ? 'success' : 'warning'"
        >
          {{ collecting ? '设备回报正在采集' : executionFresh ? captureLabel : '采集执行回执待确认' }}
        </v-chip>
        <p v-if="!executionFresh">
          这是历史执行回执或旧配置回执，不能据此判断当前采集。
        </p>
        <p v-else>
          采集条件：{{ captureReason }}。
        </p>
      </template>
      <v-chip
        class="study-presentation-status my-1"
        size="small"
        :color="visible ? 'success' : 'warning'"
      >
        {{ presentationLabel }}
      </v-chip>
      <p v-if="presentationFresh">
        展示条件：{{ presentationReason }}。
      </p>
      <p>展示回执来自桌面窗口与界面更新；实际大屏画面仍需在设备端验收。</p>
      <p>配置已应用、执行许可和新鲜采样分别核查；这里显示设备回报，统计详情请查看噪音报告。</p>
      <v-btn
        v-if="data.resumeSupported || resumableReason"
        size="small"
        variant="tonal"
        :disabled="!canResume || busy || resumeBusy"
        :loading="resumeBusy"
        @click="resumeWindow"
      >
        恢复本时段监测
      </v-btn>
      <p v-if="resumableReason && !resumeSupported">
        恢复能力尚未获得当前设备的新鲜确认，请刷新或核对桌面版本。
      </p>
      <p v-if="resumeRecord">
        最近恢复请求（{{ resumeRecord.command?.window?.start?.replace('T', ' ') }} 至 {{ resumeRecord.command?.window?.end?.replace('T', ' ') }}）：{{ resumeLabel }}。实际采集仍以新鲜执行回执为准。
      </p>
      <v-alert
        v-if="resumeError"
        type="warning"
        variant="tonal"
        class="my-2"
      >
        {{ resumeError }}
      </v-alert>
      <p v-if="data.receivedAt">
        回执接收时间：{{ receivedAt }}
      </p>
    </template>
  </section>
</template>

<script setup>
import {computed, onUnmounted, ref, watch} from 'vue';
import {npepStudySettingsApi} from '@/utils/classworksV2Client';
import {npepErrorMessage} from '@/utils/npepPresentation';

const props = defineProps({schoolId: {type: String, required: true}, deviceId: {type: String, required: true}});
const data = ref(null), busy = ref(false), error = ref(''), elapsed = ref(0);
const resumeBusy = ref(false), resumeError = ref('');
let resumeRequest;
let requestEpoch = 0, queriedAt = 0, resumeQueriedAt = 0, controller;
const timer = setInterval(() => {elapsed.value = queriedAt ? globalThis.performance.now() - queriedAt : 0;}, 1000);
const fresh = computed(() => !busy.value && !error.value && data.value?.fresh === true
  && Number.isFinite(data.value.observationAgeMs) && data.value.observationAgeMs >= 0
  && data.value.observationAgeMs + elapsed.value < 15000);
const currentVersion = computed(() => typeof data.value?.current?.version === 'string'
  && /^[a-f0-9]{64}$/.test(data.value.current.version) && data.value.observation?.version === data.value.current.version);
const executionFresh = computed(() => !busy.value && !error.value && data.value?.executionFresh === true
  && typeof data.value?.current?.version === 'string' && data.value.executionVersion === data.value.current.version
  && Number.isFinite(data.value.executionAgeMs) && data.value.executionAgeMs >= 0 && data.value.executionAgeMs + elapsed.value < 15000
  && fresh.value);
const collecting = computed(() => executionFresh.value && data.value?.captureVerified === true
  && data.value.execution?.owner === 'Schedule' && data.value.execution?.state === 'Active'
  && data.value.execution?.signalFresh === true && data.value.execution?.reason === 'WINDOW_ACTIVE');
const captureLabel = computed(() => data.value?.execution?.owner === 'Manual' ? '手动监测独立运行'
  : data.value?.execution?.state === 'Starting' ? '采集正在启动'
    : data.value?.execution?.state === 'Active' ? '采集未获新鲜信号确认' : '设备回报未在定时采集');
const captureReason = computed(() => ({POLICY_EXPIRED: '等待执行许可', NOT_ELIGIBLE: '互联或授权条件未满足', DISABLED: '监测已关闭',
  EXAM_PAUSED: '考试模式暂停', SCHOOL_CLOCK_UNAVAILABLE: '学校时间待确认', OUTSIDE_WINDOW: '自习时段外',
  WINDOW_SKIPPED: '本时段已停止', WINDOW_FAILED: '本时段采集失败', MICROPHONE_NOT_CONFIGURED: '尚未选择麦克风',
  STATISTICS_STORE_UNAVAILABLE: '统计存储不可用', SCHEDULE_STORE_UNAVAILABLE: '排程存储不可用', CAPTURE_STARTING: '正在启动采集',
  CAPTURE_BUSY: '等待麦克风释放', MANUAL_ACTIVE: '手动监测独立运行', WINDOW_ACTIVE: data.value?.execution?.signalFresh ? '收到新鲜采样' : '等待新鲜采样'}[data.value?.execution?.reason] || '待确认'));
const applied = computed(() => fresh.value && data.value?.configurationApplied === true && currentVersion.value);
const presentationFresh = computed(() => applied.value && data.value?.presentationFresh === true
  && data.value.presentationVersion === data.value.current.version
  && Number.isFinite(data.value.presentationAgeMs) && data.value.presentationAgeMs >= 0
  && data.value.presentationAgeMs + elapsed.value < 5000
  && Number.isFinite(data.value.presentationRemainingMs) && data.value.presentationRemainingMs > elapsed.value);
const visible = computed(() => presentationFresh.value && data.value.presentationVerified === true && data.value.presentation?.state === 'Visible');
const presentationLabel = computed(() => !data.value?.presentation ? '尚无展示执行回执'
  : !presentationFresh.value ? '展示执行回执待确认' : visible.value ? '设备回报展示页可见'
    : ({Hidden: '设备回报展示页已收起', NotRequired: '当前无需展示自习', Blocked: '展示条件未满足', Unknown: '展示状态待确认'}[data.value.presentation.state] || '展示状态待确认'));
const presentationReason = computed(() => ({FRAME_CURRENT: '窗口可见且界面近期更新', TEMPORARY_HIDE: '临时使用电脑，按期限返回',
  APP_HIDDEN: '桌面窗口已收起', FRAME_STALE: '界面更新待确认', APP_STALE: '桌面回执已失效', WAITING_APP: '等待展示窗口回执',
  WAITING_HIDE_CONFIRMATION: '等待窗口收起回执',
  DISABLED: '自习展示已关闭', OUTSIDE_WINDOW: '自习时段外', EXAM_PAUSED: '考试模式暂停',
  SCHOOL_CLOCK_UNAVAILABLE: '学校时间待同步'}[data.value?.presentation?.reason] || '待确认'));
const resumableReason = computed(() => ['WINDOW_SKIPPED', 'WINDOW_FAILED'].includes(data.value?.execution?.reason));
const resumeSupported = computed(() => applied.value && data.value?.resumeSupported === true
  && Number.isFinite(data.value.resumeAgeMs) && data.value.resumeAgeMs >= 0 && data.value.resumeAgeMs + elapsed.value < 15000);
const resumeRecord = computed(() => data.value?.resumeCommands?.at(-1));
const resumeRemaining = computed(() => {
  void elapsed.value;
  return Number.isFinite(resumeRecord.value?.remainingMs)
    ? Math.max(0, resumeRecord.value.remainingMs - Math.max(0, globalThis.performance.now() - resumeQueriedAt)) : 0;
});
const resumeLabel = computed(() => {
  void elapsed.value;
  return {ACCEPTED: '设备已处理恢复指令', REJECTED: '设备拒绝恢复指令', UNKNOWN: '恢复结果未获确认'}[resumeRecord.value?.receipt?.outcome]
    || (resumeRemaining.value <= 0 ? '恢复结果未获确认' : '恢复请求已受理，等待设备回执');
});
const canResume = computed(() => resumeSupported.value && executionFresh.value && resumableReason.value
  && data.value.execution.owner === 'None' && ['Idle', 'Stopped', 'Faulted'].includes(data.value.execution.state)
  && data.value.observation.phase === 'Active' && data.value.execution.clockReady && data.value.execution.window
  && (!resumeRecord.value || resumeRecord.value.receipt || resumeRemaining.value <= 0));
const source = computed(() => ({Grade: '继承年级', Class: '班级单独设置', Disabled: '已关闭', None: '尚未配置'}[data.value?.current?.effective?.source] || '待确认'));
const phase = computed(() => ({Preparing: '准备开始', Active: '自习时段内', Outside: '自习时段外', Disabled: '已关闭', Blocked: '暂停或等待条件'}[data.value?.observation?.phase] || '待确认'));
const receivedAt = computed(() => Number.isFinite(Date.parse(data.value?.receivedAt)) ? new Date(data.value.receivedAt).toLocaleString('zh-CN') : '未知');
function clear() {
  requestEpoch++; controller?.abort(); data.value = null; busy.value = false; error.value = ''; queriedAt = 0; elapsed.value = 0;
  resumeBusy.value = false; resumeError.value = ''; resumeRequest = undefined; resumeQueriedAt = 0;
}
watch(() => [props.schoolId, props.deviceId], clear);
onUnmounted(() => {clearInterval(timer); clear();});
async function refresh() {
  if (busy.value || resumeBusy.value) return;
  const epoch = ++requestEpoch;
  const startedAt = globalThis.performance.now();
  controller = new AbortController(); busy.value = true; error.value = '';
  try {
    const result = await npepStudySettingsApi.management(props.schoolId, props.deviceId, {signal: controller.signal});
    if (epoch !== requestEpoch) return;
    data.value = result.data; queriedAt = startedAt; resumeQueriedAt = startedAt; elapsed.value = globalThis.performance.now() - startedAt;
  } catch (cause) {
    if (epoch !== requestEpoch) return;
    error.value = [404, 426].includes(cause.response?.status) ? '当前服务尚未支持自习应用回执。' : npepErrorMessage(cause);
  } finally {if (epoch === requestEpoch) busy.value = false;}
}
async function resumeWindow() {
  if (!canResume.value || busy.value || resumeBusy.value) return;
  const version = data.value.current.version, window = {...data.value.execution.window};
  if (!resumeRequest || resumeRequest.version !== version || JSON.stringify(resumeRequest.window) !== JSON.stringify(window))
    resumeRequest = {requestId: globalThis.crypto.randomUUID(), version, window};
  const epoch = ++requestEpoch;
  const startedAt = globalThis.performance.now();
  controller = new AbortController(); resumeBusy.value = true; resumeError.value = '';
  try {
    const result = await npepStudySettingsApi.resume(props.schoolId, props.deviceId, resumeRequest, {signal: controller.signal});
    if (epoch !== requestEpoch) return;
    resumeQueriedAt = startedAt;
    data.value = {...data.value, executionFresh: false, resumeCommands: [...(data.value.resumeCommands || []), result.data].slice(-5)};
    resumeRequest = undefined;
  } catch (cause) {
    if (epoch !== requestEpoch) return;
    resumeError.value = cause.response ? npepErrorMessage(cause) : '请求结果待核对，请刷新回执；重试将沿用同一请求编号。';
    if (cause.response) resumeRequest = undefined;
  } finally {if (epoch === requestEpoch) resumeBusy.value = false;}
}
</script>

<style scoped>
.study-device-status { padding: 14px 16px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 12px; }
.study-device-status p { color: rgba(var(--v-theme-on-surface), .75); font-size: 13px; }
</style>
