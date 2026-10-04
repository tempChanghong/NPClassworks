<template>
  <v-alert
    v-if="candidate && !displayContext && blocked"
    class="mt-3"
    type="info"
    variant="tonal"
  >
    定时监测已开始；完成当前操作后会显示监测画面。
  </v-alert>
  <v-alert
    v-if="candidate && !displayContext && returnRemainingLabel"
    class="mt-3"
    type="info"
    variant="tonal"
  >
    已临时返回作业板，监测仍在进行；约 {{ returnRemainingLabel }} 后恢复展示。
  </v-alert>
  <v-alert
    v-if="candidate && !displayContext && currentReturn && returnError"
    class="mt-2"
    type="warning"
    variant="tonal"
  >
    {{ returnError }}
  </v-alert>
  <v-alert
    v-if="candidate && !displayContext && pendingRecoveryWindow === candidate.windowKey"
    class="mt-3"
    type="info"
    variant="tonal"
  >
    返回期限已到；完成当前操作后会恢复监测展示。
  </v-alert>

  <section
    v-if="displayContext && !blocked"
    class="scheduled-noise-display"
    aria-label="定时监测展示"
  >
    <div class="scheduled-noise-display__frame">
      <header class="scheduled-noise-display__header">
        <div>
          <div class="scheduled-noise-display__eyebrow">
            {{ className }} · 自习监测
          </div>
          <div class="scheduled-noise-display__meta">
            {{ sourceLabel }} · {{ connectionLabel }}
            <span v-if="displayContext.provider === 'native' && displayContext.window">
              · 本次 {{ clock(displayContext.window.start) }}—{{ clock(displayContext.window.end) }}
            </span>
          </div>
        </div>
        <div
          v-if="schoolClock"
          class="scheduled-noise-display__school-clock"
        >
          学校时间 {{ schoolClock }}
        </div>
      </header>

      <main class="scheduled-noise-display__main">
        <div
          class="scheduled-noise-display__status-icon"
          aria-hidden="true"
        >
          <v-icon :icon="phase === 'active' ? 'mdi-waveform' : 'mdi-information-outline'" />
        </div>
        <h1>{{ headline }}</h1>
        <p
          v-if="remainingLabel"
          class="scheduled-noise-display__remaining"
        >
          距本次结束 {{ remainingLabel }}
        </p>
        <p
          v-else-if="phase === 'active' && displayContext.provider === 'native'"
          class="scheduled-noise-display__remaining-note"
        >
          剩余时间待学校时钟确认
        </p>
        <p class="scheduled-noise-display__explanation">
          {{ explanation }}
        </p>

        <div class="scheduled-noise-display__reading">
          <div class="scheduled-noise-display__value">
            {{ validDbfs ? level(currentDbfs) : '—' }}
            <span>dBFS 信号电平</span>
          </div>
          <div class="scheduled-noise-display__signal">
            <strong>{{ signalLabel }}</strong>
            <span>{{ deviceLabel }}</span>
            <span v-if="lastReport">最近回传 {{ lastReport }}</span>
          </div>
        </div>
        <div
          v-if="trend.length > 1 && validDbfs"
          class="scheduled-noise-display__trend"
          aria-label="近一分钟有效信号走势"
        >
          <span
            v-for="(sample, index) in trend"
            :key="index"
            :style="{height: `${Math.max(8, Math.min(100, (sample + 100) * 1.2))}%`}"
          />
        </div>
        <p class="scheduled-noise-display__disclaimer">
          dBFS 为数字信号电平，未经声压级校准；走势只显示最近收到的有效样本。
        </p>
        <v-alert
          v-if="policyPending"
          type="warning"
          variant="tonal"
          density="compact"
        >
          当前规则待桌面确认；监测状态以本次实际采集回传为准。
        </v-alert>
        <v-alert
          v-if="stopRequested"
          type="info"
          variant="tonal"
          density="compact"
        >
          停止请求已提交，等待桌面执行回执；此时不能认定监测已停止。
        </v-alert>
        <v-alert
          v-if="native.error && displayContext.provider === 'native'"
          type="warning"
          variant="tonal"
          density="compact"
        >
          {{ native.error }}
        </v-alert>
      </main>

      <footer class="scheduled-noise-display__footer">
        <v-btn
          size="large"
          variant="tonal"
          prepend-icon="mdi-view-dashboard-outline"
          @click="returnToBoard"
        >
          返回作业板
        </v-btn>
        <span>返回作业板不会停止采集；{{ returnMinutes }} 分钟后自动恢复展示</span>
        <v-spacer />
        <v-btn
          size="large"
          variant="text"
          @click="$emit('details')"
        >
          查看详情
        </v-btn>
        <v-btn
          v-if="displayContext.provider === 'native'"
          size="large"
          color="error"
          variant="tonal"
          :disabled="phase !== 'active' || native.busy || stopRequested"
          @click="confirmStop = true"
        >
          结束本次监测
        </v-btn>
      </footer>
    </div>
  </section>

  <v-dialog
    v-model="confirmStop"
    max-width="460"
  >
    <v-card class="rounded-xl">
      <v-card-title>验证并结束本次监测</v-card-title>
      <v-card-text>
        输入本大屏 PIN 申请停止。服务端和桌面会再次核对定时会话；获准后本时段不会自动重启。
        <v-text-field
          v-model="stopPin"
          class="mt-4"
          label="本大屏 PIN"
          type="password"
          autocomplete="off"
          :error-messages="stopPinError"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="confirmStop = false"
        >
          取消
        </v-btn>
        <v-btn
          color="error"
          :loading="native.busy"
          :disabled="!stopPin"
          @click="requestStop"
        >
          发送停止请求
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {nativeNoise, nativeNoiseState as native} from '@/utils/nativeNoise';
import {noiseMonitoringState as browser} from '@/utils/noiseMonitoring';
import {noiseService} from '@/utils/noiseService';
import {npepNoiseDisplayApi} from '@/utils/classworksV2Client';
import {getServerUrl} from '@/utils/socketClient';
import {level, qualityName} from '@/utils/nativeNoisePresentation';
import {
  browserScheduledDisplayCandidate, nativeDisplayPhase, nativeScheduledDisplayCandidate,
  hydrateScheduledReturn, scheduledReturnRemainingMs, scheduledReturnStorageKey,
  schoolCalendarMilliseconds, schoolRemainingSeconds, serverReturnRemainingMs,
} from '@/utils/scheduledNoiseDisplay';

const props = defineProps({bindingId: {type: String, default: ''}, className: {type: String, default: '班级大屏'}, blocked: Boolean});
defineEmits(['details']);
const displayContext = ref(null);
const confirmStop = ref(false);
const stopRequested = ref(false);
const stopPin = ref('');
const stopPinError = ref('');
const trend = ref([]);
const clockAnchor = ref(null);
const noiseObservedAt = ref(0);
const scheduleObservedAt = ref(0);
const tick = ref(0);
const returnState = ref(null);
const returnMinutes = ref(10);
const returnError = ref('');
const returnChecked = ref(false);
const pendingRecoveryWindow = ref('');
const browserSnapshot = ref(noiseService.snapshot());
let timer;
let endTimer;
let unsubscribeBrowser;
let lastSample = '';
let lastSampleAt = 0;
let dismissedInMemory = '';
let returnSyncing = false;
let returnGeneration = 0;

const freshNative = computed(() => {
  tick.value;
  const now = window.performance.now();
  return noiseObservedAt.value > 0 && scheduleObservedAt.value > 0
    && now - noiseObservedAt.value < 7000 && now - scheduleObservedAt.value < 7000;
});
const candidate = computed(() => native.value.provider === 'native'
  ? freshNative.value ? nativeScheduledDisplayCandidate(native.value, native.value.schedule) : null
  : browserScheduledDisplayCandidate(native.value.provider, browser.value, props.bindingId));
const phase = computed(() => {
  if (!displayContext.value) return 'unknown';
  if (displayContext.value.provider === 'browser') {
    return browserScheduledDisplayCandidate(native.value.provider, browser.value, props.bindingId) ? 'active' : 'ended';
  }
  if (!freshNative.value) return 'unknown';
  return nativeDisplayPhase(native.value, native.value.schedule, displayContext.value);
});
const freshAnchor = computed(() => {
  tick.value;
  return clockAnchor.value && window.performance.now() - clockAnchor.value.seenAt < 7000;
});
const remainingLabel = computed(() => {
  if (phase.value !== 'active' || displayContext.value?.provider !== 'native' || !freshAnchor.value) return '';
  const seconds = schoolRemainingSeconds(clockAnchor.value.schoolNow, displayContext.value.window.end,
    window.performance.now() - clockAnchor.value.seenAt);
  return seconds === null ? '' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
});
const schoolClock = computed(() => {
  if (phase.value !== 'active' || !freshAnchor.value) return '';
  const base = schoolCalendarMilliseconds(clockAnchor.value.schoolNow);
  return base === null ? '' : new Date(base + window.performance.now() - clockAnchor.value.seenAt)
    .toISOString().slice(0, 19).replace('T', ' ');
});
const sourceLabel = computed(() => displayContext.value?.provider === 'browser' ? '网页定时监测'
  : ({Grade: '年级排程', Class: '班级覆盖'})[
    native.value.schedule?.status?.source
      || (native.value.schedule?.applied === false ? null : native.value.schedule?.policy?.source)
  ] || '学校排程');
const connectionLabel = computed(() => phase.value === 'active' ? '设备已连接' : '当前状态待确认');
const headline = computed(() => phase.value === 'exam' ? '考试期间暂停展示'
  : phase.value === 'ended' ? '本次监测已结束'
    : phase.value !== 'active' ? '监测状态待确认'
      : validDbfs.value ? '自习监测中' : '采样待核对');
const explanation = computed(() => phase.value === 'exam' ? '考试安排优先，监测展示已退出。'
  : phase.value === 'ended' ? '报告可能仍在上传，即将返回作业板。'
    : phase.value !== 'active' ? '回传暂不可确认；请到 NPEduTools 查看实际采集状态。'
      : validDbfs.value ? '数字信号仅用于核对麦克风输入，不代表教室声压级。'
        : '采集已启动，但还没有可展示的有效采样；请检查麦克风输入。');
const currentDbfs = computed(() => displayContext.value?.provider === 'browser'
  ? browserSnapshot.value.currentDbfs : native.value.status?.currentDbfs);
const validDbfs = computed(() => phase.value === 'active' && Number.isFinite(currentDbfs.value)
  && (displayContext.value?.provider === 'browser'
    ? browserSnapshot.value.signalHealth?.quality === 'good' : native.value.status?.quality === 'Good'));
const signalLabel = computed(() => phase.value !== 'active' ? '信号状态未知'
  : displayContext.value?.provider === 'browser'
    ? validDbfs.value ? '采样有效' : '等待有效采样'
    : qualityName(native.value.status?.quality, native.value.status?.currentDbfs));
const deviceLabel = computed(() => displayContext.value?.provider === 'browser'
  ? browserSnapshot.value.microphone?.label || '网页麦克风'
  : native.value.status?.deviceName || '请在 NPEduTools 保存麦克风');
const lastReport = computed(() => {
  if (phase.value !== 'active' || !native.value.receivedAt) return '';
  const receivedAt = new Date(native.value.receivedAt);
  return Number.isNaN(receivedAt.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(receivedAt);
});
const policyPending = computed(() => phase.value === 'active' && displayContext.value?.provider === 'native'
  && native.value.schedule?.applied === false);

const currentReturn = computed(() => {
  tick.value;
  return returnState.value?.windowKey === candidate.value?.windowKey
    && scheduledReturnRemainingMs(returnState.value, window.performance.now()) > 0
    ? returnState.value : null;
});
const returnRemainingLabel = computed(() => {
  if (!currentReturn.value) return '';
  const seconds = Math.ceil(scheduledReturnRemainingMs(currentReturn.value, window.performance.now()) / 1000);
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} 分钟` : `${seconds} 秒`;
});
function returnKey() { return scheduledReturnStorageKey(getServerUrl(), props.bindingId); }
function saveReturn(value) {
  if (value) pendingRecoveryWindow.value = '';
  returnState.value = value ? {...value, savedAt: Date.now(),
    remainingMs: scheduledReturnRemainingMs(value, window.performance.now()),
    anchorAt: window.performance.now()} : null;
  try {
    if (returnState.value) localStorage.setItem(returnKey(), JSON.stringify(returnState.value));
    else localStorage.removeItem(returnKey());
  } catch { /* In-memory countdown remains bounded. */ }
}
function loadReturn() {
  try {
    const value = JSON.parse(localStorage.getItem(returnKey()) || 'null');
    returnState.value = hydrateScheduledReturn(value, Date.now(), window.performance.now());
    if (value?.windowKey && !returnState.value) pendingRecoveryWindow.value = value.windowKey;
  } catch { returnState.value = null; }
}
function isDismissed(value) {
  if (dismissedInMemory === `${props.bindingId}:${value.windowKey}`) return true;
  return value.provider === 'native' && Boolean(currentReturn.value);
}
function acceptReturn(reply, previous = null, requestStartedAt = window.performance.now()) {
  if (Number.isInteger(reply?.returnMinutes)) returnMinutes.value = reply.returnMinutes;
  const active = reply?.activeReturn;
  const key = active?.window && JSON.stringify([active.window.start, active.window.end]);
  const nowMono = window.performance.now();
  let remainingMs = serverReturnRemainingMs(active, reply?.serverNow, nowMono - requestStartedAt);
  if (previous?.windowKey === key)
    remainingMs = Math.min(remainingMs, scheduledReturnRemainingMs(previous, nowMono));
  if (!active || key !== candidate.value?.windowKey || remainingMs <= 0) {
    if (previous?.windowKey === candidate.value?.windowKey) pendingRecoveryWindow.value = previous.windowKey;
    saveReturn(null);
    return;
  }
  const now = Date.now();
  saveReturn({windowKey: key, requestId: previous?.requestId || globalThis.crypto.randomUUID(),
    startedAt: previous?.startedAt || now,
    expiresAt: now + remainingMs, returnMinutes: active.returnMinutes,
    remainingMs, anchorAt: nowMono, confirmed: true});
}
async function syncReturn() {
  const value = candidate.value;
  if (returnSyncing || value?.provider !== 'native') return;
  returnSyncing = true;
  const generation = returnGeneration;
  const requestStartedAt = window.performance.now();
  try {
    const reply = await npepNoiseDisplayApi.screen();
    if (generation !== returnGeneration || candidate.value?.windowKey !== value.windowKey) return;
    const previous = returnState.value;
    if (reply.activeReturn?.remainingSeconds > 0) {
      acceptReturn(reply, previous, requestStartedAt);
    } else if (previous?.windowKey === value.windowKey
      && scheduledReturnRemainingMs(previous, window.performance.now()) > 0 && !previous.confirmed) {
      const postStartedAt = window.performance.now();
      const posted = await npepNoiseDisplayApi.screen({requestId: previous.requestId,
        window: value.window, offlineStartedAt: new Date(previous.startedAt).toISOString(),
        returnMinutes: previous.returnMinutes});
      if (generation === returnGeneration && candidate.value?.windowKey === value.windowKey)
        acceptReturn(posted, previous, postStartedAt);
    } else {
      returnMinutes.value = reply.returnMinutes || 10;
      if (previous?.windowKey === value.windowKey
        && scheduledReturnRemainingMs(previous, window.performance.now()) <= 0)
        pendingRecoveryWindow.value = value.windowKey;
      saveReturn(null);
    }
    returnError.value = '';
  } catch {
    returnError.value = '返回期限暂未与学校服务同步；当前页面仍会按原期限恢复展示。';
  } finally {
    if (generation === returnGeneration) returnChecked.value = true;
    returnSyncing = false;
    if (generation !== returnGeneration && candidate.value?.provider === 'native')
      globalThis.queueMicrotask(syncReturn);
  }
}
function openManually() {
  if (!candidate.value || props.blocked) return;
  displayContext.value = {...candidate.value};
  pendingRecoveryWindow.value = '';
  trend.value = [];
  lastSample = '';
  lastSampleAt = 0;
  stopRequested.value = false;
}
function maybeOpen() {
  tick.value;
  const value = candidate.value;
  if (!value || props.blocked || document.visibilityState !== 'visible') return;
  if (value.provider === 'native' && !returnChecked.value) return;
  // An existing Vuetify editor, copy view or confirmation keeps its input and focus.
  if (!displayContext.value && document.querySelector('.v-overlay--active')) return;
  if (displayContext.value?.windowKey === value.windowKey && displayContext.value.provider === value.provider) {
    if (displayContext.value.sessionId !== value.sessionId) openManually();
    return;
  }
  if (isDismissed(value)) return;
  openManually();
}
async function returnToBoard() {
  const value = displayContext.value;
  if (value) {
    if (value.provider === 'native') {
      if (!(returnState.value?.windowKey === value.windowKey
        && scheduledReturnRemainingMs(returnState.value, window.performance.now()) > 0)) {
        const now = Date.now();
        const remainingMs = returnMinutes.value * 60000;
        saveReturn({windowKey: value.windowKey, requestId: globalThis.crypto.randomUUID(),
          startedAt: now, expiresAt: now + remainingMs, remainingMs,
          anchorAt: window.performance.now(), returnMinutes: returnMinutes.value, confirmed: false});
      }
    } else {
      dismissedInMemory = `${props.bindingId}:${value.windowKey}`;
    }
  }
  displayContext.value = null;
  confirmStop.value = false;
  stopPin.value = '';
  if (value?.provider === 'native') await syncReturn();
}
async function requestStop() {
  if (phase.value !== 'active' || displayContext.value?.provider !== 'native') return;
  if (!stopPin.value) { stopPinError.value = '请输入本大屏 PIN'; return; }
  stopRequested.value = await nativeNoise.protectedStop(stopPin.value);
  stopPin.value = '';
  if (stopRequested.value) { confirmStop.value = false; stopPinError.value = ''; }
  else stopPinError.value = native.value.error || '停止请求未确认';
}

watch([candidate, () => props.blocked, tick, returnState, returnChecked], maybeOpen, {immediate: true});
watch(() => candidate.value?.windowKey, () => {
  returnGeneration++;
  returnChecked.value = false;
  if (pendingRecoveryWindow.value !== candidate.value?.windowKey) pendingRecoveryWindow.value = '';
});
watch(candidate, value => {
  if (value?.provider === 'native') {
    if (returnState.value && returnState.value.windowKey !== value.windowKey) saveReturn(null);
    syncReturn();
  }
});
watch(() => props.bindingId, () => {
  returnGeneration++;
  returnChecked.value = false;
  displayContext.value = null;
  confirmStop.value = false;
  trend.value = [];
  noiseObservedAt.value = 0;
  scheduleObservedAt.value = 0;
  dismissedInMemory = '';
  returnState.value = null;
  returnError.value = '';
  pendingRecoveryWindow.value = '';
  loadReturn();
});
watch(() => browser.value.scheduledActive, active => {
  if (!active && displayContext.value?.provider !== 'browser') dismissedInMemory = '';
});
watch(() => native.value.status, status => {
  noiseObservedAt.value = status ? window.performance.now() : 0;
});
watch(() => native.value.schedule, schedule => {
  scheduleObservedAt.value = schedule ? window.performance.now() : 0;
  const status = schedule?.status;
  clockAnchor.value = schedule?.online && status?.clockReady && !status.dateNeedsReview && status.schoolNow
    ? {schoolNow: status.schoolNow, seenAt: window.performance.now()} : null;
  if (schedule?.online && ['EXAM_PAUSED', 'WINDOW_SKIPPED', 'OUTSIDE_WINDOW'].includes(status?.reason)) {
    saveReturn(null);
    if (status.reason === 'EXAM_PAUSED') displayContext.value = null;
  }
});
watch(phase, value => {
  window.clearTimeout(endTimer);
  if (value === 'exam') { saveReturn(null); displayContext.value = null; return; }
  if (value === 'ended') {
    saveReturn(null);
    endTimer = window.setTimeout(() => { if (phase.value === 'ended') displayContext.value = null; }, 5000);
  }
  if (value === 'active' && stopRequested.value && displayContext.value?.sessionId !== native.value.status?.sessionId)
    stopRequested.value = false;
});
watch(native, value => {
  if (!displayContext.value || phase.value !== 'active' || displayContext.value.provider !== 'native'
    || value.status?.quality !== 'Good' || !Number.isFinite(value.status.currentDbfs)) return;
  const sampleKey = `${value.receivedAt}:${value.status.currentDbfs}`;
  if (sampleKey === lastSample) return;
  lastSample = sampleKey;
  if (trend.value.length && window.performance.now() - lastSampleAt > 60000) trend.value = [];
  lastSampleAt = window.performance.now();
  trend.value = [...trend.value.slice(-19), value.status.currentDbfs];
});
onMounted(() => {
  loadReturn();
  syncReturn();
  window.addEventListener('online', syncReturn);
  timer = window.setInterval(() => {
    tick.value++;
    if (returnState.value?.windowKey === candidate.value?.windowKey
      && scheduledReturnRemainingMs(returnState.value, window.performance.now()) <= 0)
      pendingRecoveryWindow.value = returnState.value.windowKey;
    if (tick.value % 15 === 0) syncReturn();
  }, 1000);
  unsubscribeBrowser = noiseService.subscribe(value => { browserSnapshot.value = value; });
});
onUnmounted(() => {
  returnGeneration++;
  window.removeEventListener('online', syncReturn);
  window.clearInterval(timer);
  window.clearTimeout(endTimer);
  unsubscribeBrowser?.();
});
defineExpose({openManually});
const clock = value => value?.slice(11, 16) || '--:--';
</script>

<style scoped>
.scheduled-noise-display { position: fixed; inset: 0; z-index: 100; overflow-y: auto; background: rgb(var(--v-theme-background)); color: rgb(var(--v-theme-on-background)); }
.scheduled-noise-display__frame { min-height: 100dvh; display: flex; flex-direction: column; padding: clamp(20px, 3vw, 48px); }
.scheduled-noise-display__header, .scheduled-noise-display__footer { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
.scheduled-noise-display__header { justify-content: space-between; border-bottom: 1px solid rgba(var(--v-border-color), .25); padding-bottom: 18px; }
.scheduled-noise-display__eyebrow { color: rgb(var(--v-theme-primary)); font-size: clamp(1.3rem, 1.7vw, 2rem); font-weight: 750; }
.scheduled-noise-display__meta, .scheduled-noise-display__school-clock { font-size: clamp(.95rem, 1.15vw, 1.25rem); margin-top: 6px; }
.scheduled-noise-display__main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 13px; padding: 30px 0; text-align: center; }
.scheduled-noise-display__status-icon { display: grid; place-items: center; width: 78px; height: 78px; border-radius: 22px; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); font-size: 42px; }
.scheduled-noise-display h1 { font-size: clamp(2.7rem, 5.4vw, 6rem); line-height: 1.1; }
.scheduled-noise-display__remaining { font-size: clamp(1.7rem, 3.3vw, 3.8rem); font-variant-numeric: tabular-nums; font-weight: 650; }
.scheduled-noise-display__remaining-note, .scheduled-noise-display__explanation { font-size: clamp(1rem, 1.35vw, 1.5rem); }
.scheduled-noise-display__reading { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 22px; width: min(100%, 920px); margin-top: 12px; padding: 16px 24px; border-radius: 20px; background: rgb(var(--v-theme-surface)); border: 1px solid rgba(var(--v-border-color), .25); }
.scheduled-noise-display__value { font-size: clamp(2.3rem, 4.5vw, 5rem); font-weight: 750; font-variant-numeric: tabular-nums; white-space: nowrap; }
.scheduled-noise-display__value span { display: block; font-size: 1rem; font-weight: 400; }
.scheduled-noise-display__signal { display: grid; gap: 4px; text-align: left; font-size: clamp(.9rem, 1.05vw, 1.2rem); }
.scheduled-noise-display__trend { height: 64px; width: min(100%, 760px); display: flex; align-items: end; justify-content: center; gap: 4px; }
.scheduled-noise-display__trend span { flex: 1; max-width: 26px; min-width: 4px; border-radius: 4px 4px 0 0; background: rgb(var(--v-theme-primary)); }
.scheduled-noise-display__disclaimer { opacity: .72; font-size: .9rem; }
.scheduled-noise-display__footer { border-top: 1px solid rgba(var(--v-border-color), .25); padding-top: 18px; }
.scheduled-noise-display__footer :deep(.v-btn) { min-height: 54px; }
.scheduled-noise-display__footer > span { font-size: .9rem; opacity: .72; }
@media (max-height: 820px) {
  .scheduled-noise-display__frame { padding: 16px 28px; }
  .scheduled-noise-display__header { padding-bottom: 8px; }
  .scheduled-noise-display__main { gap: 6px; padding: 8px 0; }
  .scheduled-noise-display__status-icon { display: none; }
  .scheduled-noise-display h1 { font-size: clamp(2.6rem, 4vw, 4rem); }
  .scheduled-noise-display__remaining { font-size: clamp(1.5rem, 2.5vw, 2.5rem); }
  .scheduled-noise-display__reading { margin-top: 4px; padding: 8px 20px; }
  .scheduled-noise-display__value { font-size: clamp(2rem, 3vw, 3.5rem); }
  .scheduled-noise-display__trend { height: 35px; }
  .scheduled-noise-display__footer { padding-top: 8px; }
  .scheduled-noise-display__footer :deep(.v-btn) { min-height: 48px; }
}
@media (max-width: 700px) { .scheduled-noise-display__footer .v-btn { flex: 1 1 100%; } .scheduled-noise-display__signal { text-align: center; } }
</style>
