<template>
  <section
    class="noise-display-settings"
    aria-label="定时监测展示返回时长"
  >
    <div class="noise-display-settings__heading">
      <h3>定时展示 · 返回作业板时长</h3>
      <p>返回作业板不停止采集；到期后仍在定时监测时自动恢复展示。本设置不改变采集时段。</p>
    </div>
    <v-alert
      v-if="error"
      class="mb-3"
      type="warning"
      variant="tonal"
    >
      {{ error }}
    </v-alert>
    <v-alert
      v-if="message"
      class="mb-3"
      type="success"
      variant="tonal"
    >
      {{ message }}
    </v-alert>
    <p class="noise-display-settings__current">
      当前生效：{{ effective.returnMinutes }} 分钟 · {{ sourceLabel }}。
      {{ targetType === 'GRADE' ? '此设置供本年级各班继承。' : '班级可单独覆盖年级设置。' }}
    </p>
    <v-checkbox
      v-if="targetType === 'CLASS'"
      v-model="inherit"
      label="继承年级返回时长"
      :disabled="busy || loading"
      hide-details
    />
    <div class="noise-display-settings__controls">
      <v-btn
        v-for="minutes in [5, 10]"
        :key="minutes"
        :color="!inherit && draftMinutes === minutes ? 'primary' : undefined"
        :variant="!inherit && draftMinutes === minutes ? 'tonal' : 'text'"
        :disabled="busy || loading || inherit"
        @click="draftMinutes = minutes"
      >
        {{ minutes }} 分钟
      </v-btn>
      <v-text-field
        v-model.number="draftMinutes"
        class="noise-display-settings__input"
        label="自定义分钟数"
        type="number"
        min="1"
        max="60"
        step="1"
        suffix="分钟"
        density="compact"
        variant="outlined"
        hide-details
        :disabled="busy || loading || inherit"
      />
    </div>
    <div class="noise-display-settings__actions">
      <v-btn
        color="primary"
        variant="tonal"
        :loading="busy"
        :disabled="loading || !valid || !changed"
        @click="save"
      >
        保存返回时长
      </v-btn>
      <v-btn
        variant="text"
        :disabled="busy"
        @click="load"
      >
        重新加载
      </v-btn>
    </div>
    <p class="noise-display-settings__note">
      已由服务端登记的返回沿用原截止时间。离线时尚未登记的返回不会因新配置延长；若配置缩短，可能提前恢复展示。
    </p>
  </section>
</template>

<script setup>
import {computed, ref, watch} from 'vue';
import {npepNoiseDisplayApi} from '@/utils/classworksV2Client';

const props = defineProps({schoolId: {type: String, required: true}, termId: {type: String, default: ''},
  targetType: {type: String, default: 'GRADE'}, targetId: {type: String, default: ''}});
const catalog = ref(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const message = ref('');
const draftMinutes = ref(10);
const inherit = ref(false);
let generation = 0;
const settings = computed(() => catalog.value?.settings || []);
const current = computed(() => settings.value.find(item => item.targetType === props.targetType && item.targetId === props.targetId));
const gradeId = computed(() => props.targetType === 'GRADE' ? props.targetId
  : catalog.value?.classes?.find(item => item.id === props.targetId)?.gradeId);
const grade = computed(() => settings.value.find(item => item.targetType === 'GRADE' && item.targetId === gradeId.value));
const effective = computed(() => ({returnMinutes: current.value?.returnMinutes ?? grade.value?.returnMinutes ?? 10}));
const sourceLabel = computed(() => current.value ? props.targetType === 'GRADE' ? '年级设置' : '班级覆盖'
  : grade.value ? '继承年级' : '默认值');
const valid = computed(() => inherit.value || (Number.isInteger(draftMinutes.value)
  && draftMinutes.value >= 1 && draftMinutes.value <= 60));
const changed = computed(() => inherit.value ? Boolean(current.value)
  : current.value?.returnMinutes !== draftMinutes.value);

function resetDraft() {
  inherit.value = props.targetType === 'CLASS' && !current.value;
  draftMinutes.value = current.value?.returnMinutes ?? grade.value?.returnMinutes ?? 10;
  message.value = '';
}
async function load() {
  const id = ++generation;
  if (!props.schoolId || !props.termId) { catalog.value = null; return; }
  loading.value = true;
  error.value = '';
  try {
    const response = await npepNoiseDisplayApi.settings(props.schoolId, props.termId);
    if (id !== generation) return;
    catalog.value = response.data;
    resetDraft();
  } catch (cause) {
    if (id === generation) error.value = cause?.response?.data?.error?.code || '返回时长读取失败，请重试。';
  } finally { if (id === generation) loading.value = false; }
}
async function save() {
  if (!valid.value || !changed.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await npepNoiseDisplayApi.saveSetting(props.schoolId, {requestId: globalThis.crypto.randomUUID(),
      termId: props.termId, targetType: props.targetType, targetId: props.targetId,
      expectedRevision: current.value?.revision ?? 0, returnMinutes: inherit.value ? null : draftMinutes.value});
    await load();
    message.value = '返回时长已保存；下一次返回作业板时生效。';
  } catch (cause) {
    error.value = cause?.response?.data?.error?.code || '保存失败，请重新加载后重试。';
  } finally { busy.value = false; }
}
watch(() => [props.schoolId, props.termId], load, {immediate: true});
watch(() => [props.targetType, props.targetId], resetDraft);
</script>

<style scoped>
.noise-display-settings { padding: 22px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 16px; }
.noise-display-settings__heading { margin-bottom: 16px; }
.noise-display-settings__heading h3 { font-size: 20px; font-weight: 750; }
.noise-display-settings__heading p, .noise-display-settings__note { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.noise-display-settings__current { font-size: 15px; margin-bottom: 10px; }
.noise-display-settings__controls, .noise-display-settings__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.noise-display-settings__input { flex: 0 1 190px; }
.noise-display-settings__actions { margin-top: 16px; }
.noise-display-settings__note { margin-top: 12px; }
@media (max-width: 600px) { .noise-display-settings { padding: 16px; } .noise-display-settings__input { flex: 1 1 100%; } }
</style>
