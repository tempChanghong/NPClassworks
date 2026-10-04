<template>
  <section
    class="pairing-access"
    aria-labelledby="pairing-access-title"
  >
    <header class="pairing-access-header">
      <div>
        <span class="pairing-access-eyebrow">学校设置 · NPEP</span>
        <h2 id="pairing-access-title">
          班级大屏预授权
        </h2>
        <p>决定哪些现有大屏可以在现场生成一次性网页配对码。</p>
      </div>
      <v-btn
        variant="tonal"
        :loading="busy"
        @click="refresh"
      >
        刷新预授权
      </v-btn>
    </header>
    <div class="pairing-access-content">
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
      >
        {{ error }}
      </v-alert>
      <v-alert
        v-if="message"
        type="success"
        variant="tonal"
      >
        {{ message }}
      </v-alert>

      <div
        v-if="loaded"
        class="pairing-access-overview"
      >
        <div><span>当前范围大屏</span><strong>{{ eligible.length }}</strong></div>
        <div><span>已开放网页配对</span><strong>{{ enabledCount }}</strong></div>
        <div><span>状态待核对</span><strong>{{ unknownCount }}</strong></div>
      </div>

      <section
        class="pairing-access-section"
        aria-labelledby="pairing-access-batch-title"
      >
        <div class="pairing-access-section-heading">
          <h3 id="pairing-access-batch-title">
            按范围批量设置
          </h3>
          <p>先选择全校或年级和目标状态，再预览将改变的大屏。</p>
        </div>
        <v-row dense>
          <v-col
            cols="12"
            sm="4"
          >
            <v-select
              v-model="targetType"
              label="范围"
              :items="[{title:'全校（当前学期）',value:'SCHOOL'},{title:'指定年级',value:'GRADE'}]"
              :disabled="busy"
              variant="outlined"
            />
          </v-col>
          <v-col
            v-if="targetType === 'GRADE'"
            cols="12"
            sm="4"
          >
            <v-select
              v-model="gradeId"
              label="年级"
              :items="grades"
              :disabled="busy"
              variant="outlined"
            />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <v-select
              v-model="batchEnabled"
              label="网页配对"
              :items="[{title:'开放',value:true},{title:'关闭',value:false}]"
              :disabled="busy"
              variant="outlined"
            />
          </v-col>
        </v-row>
        <p
          v-if="!termId"
          class="pairing-access-note mb-2"
        >
          请先选择有效的当前学期。
        </p>
        <v-btn
          class="pairing-access-preview-button"
          variant="tonal"
          :disabled="!canPreview"
          @click="previewBatch"
        >
          预览影响范围
        </v-btn>
        <v-sheet
          v-if="preview"
          class="pairing-access-preview mt-4"
          border
        >
          <h4>{{ preview.termName }} · {{ preview.targetName }} · {{ preview.enabled ? '开放' : '关闭' }}网页配对</h4>
          <div class="pairing-access-preview-metrics">
            <div><span>有效大屏</span><strong>{{ preview.totalScreens }}</strong></div>
            <div><span>将修改</span><strong>{{ preview.changedScreens }}</strong></div>
            <div><span>保持原状态</span><strong>{{ preview.unchangedScreens }}</strong></div>
          </div>
          <p class="pairing-access-note mt-3">
            有效大屏 {{ preview.totalScreens }} 台：修改 {{ preview.changedScreens }} 台，保持 {{ preview.unchangedScreens }} 台；排除停用或无效项目 {{ preview.excludedScreens }} 台。
          </p>
          <p
            v-if="!preview.enabled && preview.changedScreens"
            class="pairing-access-note mt-2"
          >
            被关闭大屏的未完成网页配对将失效。已连接设备不会解绑。
          </p>
          <v-list
            max-height="220"
            class="overflow-y-auto"
            density="compact"
          >
            <v-list-item
              v-for="item in preview.items"
              :key="item.screenBindingId"
              :title="`${item.administrativeClassName} · ${item.name}`"
              :subtitle="item.changed ? '将修改' : '保持原状态'"
            />
          </v-list>
          <p
            v-if="preview.truncated"
            class="pairing-access-note"
          >
            这里显示前 50 台；提交会处理上方统计的全部大屏。
          </p>
          <v-checkbox
            v-if="preview.changedScreens"
            v-model="batchConfirmed"
            :disabled="busy"
            label="已核对范围，同意批量修改网页配对预授权"
            hide-details
          />
          <div class="pairing-access-actions">
            <v-btn
              color="primary"
              :disabled="!canApply"
              @click="applyBatch"
            >
              确认批量{{ preview.enabled ? '开放' : '关闭' }}
            </v-btn>
            <v-btn
              variant="text"
              :disabled="busy"
              @click="clearPreview"
            >
              取消预览
            </v-btn>
          </div>
        </v-sheet>
        <p class="pairing-access-note mt-4">
          批量设置只作用于当前学期已存在的有效大屏，不会自动授权日后新建的大屏。
        </p>
      </section>

      <section
        class="pairing-access-section"
        aria-labelledby="pairing-access-individual-title"
      >
        <div class="pairing-access-section-heading">
          <h3 id="pairing-access-individual-title">
            逐台核对与调整
          </h3>
          <p>开放后可在大屏“课堂工具 → 连接 NPEduTools”生成配对码；关闭会使未完成的网页配对失效。</p>
        </div>
        <div
          v-if="loaded && eligible.length"
          class="pairing-access-list"
        >
          <div
            v-for="binding in eligible"
            :key="binding.id"
            class="pairing-access-device"
          >
            <div>
              <strong>{{ binding.name }}</strong>
              <span>{{ binding.administrativeClass?.name || '班级' }}</span>
            </div>
            <v-chip
              size="small"
              :color="!policies[binding.id] ? 'warning' : policies[binding.id].enabled ? 'success' : undefined"
              variant="tonal"
            >
              {{ !policies[binding.id] ? '状态待核对' : policies[binding.id].enabled ? '已开放' : '未开放' }}
            </v-chip>
            <v-btn
              :disabled="busy || !policies[binding.id]"
              :color="policies[binding.id]?.enabled ? undefined : 'primary'"
              variant="tonal"
              @click="toggle(binding.id)"
            >
              {{ policies[binding.id]?.enabled ? '关闭网页配对' : '开放网页配对' }}
            </v-btn>
          </div>
        </div>
        <p
          v-else-if="loaded"
          class="pairing-access-note"
        >
          请先创建有效班级的大屏账号。
        </p>
        <p class="pairing-access-note mt-4">
          已连接设备不会因关闭预授权而解绑；如需断开，请在互联设备列表中撤销授权。
        </p>
      </section>
    </div>
  </section>
</template>

<script setup>
import {computed, ref, watch, onUnmounted} from 'vue';
import {npepAdminApi} from '@/utils/classworksV2Client';
import {npepErrorMessage} from '@/utils/npepPresentation';
const props = defineProps({schoolId: {type: String, required: true}, termId: {type: String, default: ''}, bindings: {type: Array, default: () => []}});
const policies = ref({}), busy = ref(false), loaded = ref(false), error = ref(''), message = ref('');
const targetType = ref('SCHOOL'), gradeId = ref(null), batchEnabled = ref(true), preview = ref(null), batchConfirmed = ref(false);
const eligible = computed(() => props.bindings.filter(b => b.isActive && b.administrativeClass?.isActive !== false && b.administrativeClass?.term?.status === 'ACTIVE'
  && (!props.termId || (b.administrativeClass.termId || b.administrativeClass.term.id) === props.termId)));
const enabledCount = computed(() => eligible.value.filter(b => policies.value[b.id]?.enabled).length);
const unknownCount = computed(() => eligible.value.filter(b => !policies.value[b.id]).length);
const grades = computed(() => [...new Map(eligible.value.filter(b=>b.administrativeClass.gradeId).map(b=>[b.administrativeClass.gradeId,
  {value:b.administrativeClass.gradeId,title:b.administrativeClass.grade?.name || '年级资料待核对'}])).values()]);
const canPreview = computed(() => loaded.value && !busy.value && !!props.termId && (targetType.value === 'SCHOOL' || grades.value.some(g=>g.value===gradeId.value)));
const canApply = computed(() => canPreview.value && preview.value?.changedScreens > 0 && batchConfirmed.value);
const selection = () => JSON.stringify([props.schoolId,props.termId,targetType.value,gradeId.value,batchEnabled.value]);
function clearPreview() { preview.value = null; batchConfirmed.value = false; }
let generation = 0, controller;
async function refresh() {
  if (busy.value || !props.schoolId) return;
  const school = props.schoolId, current = generation;
  clearPreview(); message.value = '';
  busy.value = true; error.value = ''; controller = new AbortController();
  try {
    const result = await npepAdminApi.pairingAccess(school, {signal: controller.signal});
    if (current !== generation || school !== props.schoolId) return;
    policies.value = Object.fromEntries(result.data.items.map(p => [p.screenBindingId, p])); loaded.value = true;
  } catch (failure) { if (current === generation) { error.value = npepErrorMessage(failure); loaded.value = false; } }
  finally { if (current === generation) busy.value = false; }
}
async function toggle(id) {
  if (busy.value || !loaded.value || !policies.value[id]) return;
  const school = props.schoolId, current = generation, policy = policies.value[id];
  clearPreview(); message.value = '';
  busy.value = true; error.value = ''; controller = new AbortController();
  try {
    const result = await npepAdminApi.setPairingAccess(school, id, {enabled: !policy.enabled, expectedRevision: policy.revision}, {signal: controller.signal});
    if (current === generation && school === props.schoolId) policies.value = {...policies.value, [id]: result.data};
  } catch (failure) { if (current === generation) { error.value = npepErrorMessage(failure); loaded.value = false; } }
  finally { if (current === generation) busy.value = false; }
}
async function runBatch(save) {
  if (save ? !canApply.value : !canPreview.value) return;
  const school = props.schoolId, current = generation, selected = selection();
  const body = {requestId:globalThis.crypto.randomUUID(),termId:props.termId,targetType:targetType.value,
    targetId:targetType.value === 'GRADE' ? gradeId.value : null,enabled:batchEnabled.value,
    ...(save ? {previewDigest:preview.value.previewDigest} : {})};
  busy.value = true; error.value = ''; message.value = ''; controller = new AbortController();
  try {
    const result = await (save ? npepAdminApi.setPairingAccessBatch : npepAdminApi.previewPairingAccessBatch)(school,body,{signal:controller.signal});
    if (current !== generation || selected !== selection()) return;
    if (!save) { preview.value = result.data; batchConfirmed.value = false; }
    else {
      message.value = `已${body.enabled ? '开放' : '关闭'} ${result.data.changedScreens} 台大屏的网页配对；${result.data.unchangedScreens} 台保持原状态。`;
      clearPreview();
      const latest = await npepAdminApi.pairingAccess(school,{signal:controller.signal});
      if (current === generation && selected === selection()) policies.value = Object.fromEntries(latest.data.items.map(p=>[p.screenBindingId,p]));
    }
  } catch (failure) {
    if (current !== generation || selected !== selection()) return;
    clearPreview();
    error.value = message.value ? '批量操作已确认，但列表刷新失败。请刷新预授权状态。'
      : failure.response?.data?.error?.code === 'PREAUTHORIZATION_CHANGED' ? '大屏名单或预授权状态已变化，请刷新后重新预览，整批设置未保存。'
        : save && !failure.response ? '未收到批量操作结果，可能已经保存。请刷新预授权状态，再决定是否重新预览。' : npepErrorMessage(failure);
    loaded.value = false;
  } finally { if (current === generation) busy.value = false; }
}
const previewBatch = () => runBatch(false);
const applyBatch = () => runBatch(true);
watch([targetType,gradeId,batchEnabled], clearPreview, {flush:'sync'});
watch(() => [props.schoolId,props.termId], () => { generation++; controller?.abort(); clearPreview(); gradeId.value = null; policies.value = {}; loaded.value = false; busy.value = false; void refresh(); }, {immediate: true,flush:'sync'});
onUnmounted(() => { generation++; controller?.abort(); });
</script>

<style scoped>
.pairing-access { padding: 8px 0 4px; }
.pairing-access-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.pairing-access-header h2 { font-size: 24px; font-weight: 750; }
.pairing-access-header p, .pairing-access-section-heading p, .pairing-access-note { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.pairing-access-eyebrow { color: rgb(var(--v-theme-primary)); font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.pairing-access-content { display: grid; gap: 16px; }
.pairing-access-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.pairing-access-overview > div, .pairing-access-preview-metrics > div { display: grid; gap: 5px; padding: 12px; border-radius: 12px; background: rgba(var(--v-theme-on-surface), .045); }
.pairing-access-overview span, .pairing-access-preview-metrics span { color: rgba(var(--v-theme-on-surface), .68); font-size: 12px; }
.pairing-access-overview strong, .pairing-access-preview-metrics strong { font-size: 18px; }
.pairing-access-section { padding: 20px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 16px; }
.pairing-access-section-heading { margin-bottom: 18px; }
.pairing-access-section-heading h3 { font-size: 19px; font-weight: 750; }
.pairing-access-preview { padding: 18px; border-radius: 14px; }
.pairing-access-preview h4 { font-size: 17px; }
.pairing-access-preview-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
.pairing-access-preview :deep(.v-list) { margin-top: 12px; border-top: 1px solid rgba(var(--v-border-color), .16); }
.pairing-access-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.pairing-access-list { border-top: 1px solid rgba(var(--v-border-color), .16); }
.pairing-access-device { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 14px 0; border-bottom: 1px solid rgba(var(--v-border-color), .16); }
.pairing-access-device > div { display: grid; gap: 2px; min-width: 0; }
.pairing-access-device strong { overflow-wrap: anywhere; }
.pairing-access-device span { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
@media (max-width: 600px) {
  .pairing-access-header { display: grid; }
  .pairing-access-header :deep(.v-btn) { width: 100%; }
  .pairing-access-overview { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pairing-access-section { padding: 16px; }
  .pairing-access-preview { padding: 14px; }
  .pairing-access-preview-metrics { grid-template-columns: 1fr; }
  .pairing-access-preview-button, .pairing-access-actions :deep(.v-btn) { width: 100%; }
  .pairing-access-device { grid-template-columns: minmax(0, 1fr) auto; }
  .pairing-access-device :deep(.v-btn) { grid-column: 1 / -1; width: 100%; }
}
</style>
