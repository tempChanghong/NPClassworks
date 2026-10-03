<template>
  <v-card
    variant="outlined"
    class="rounded-xl mb-4"
  >
    <v-card-title class="d-flex flex-wrap align-center ga-2">
      班级大屏预授权
      <v-spacer />
      <v-btn
        variant="text"
        :loading="busy"
        @click="refresh"
      >
        刷新预授权
      </v-btn>
    </v-card-title>
    <v-card-text>
      <p class="mb-3">
        开放后，该班级大屏可在“课堂工具 → 连接 NPEduTools”生成配对码，现场输入桌面端即可核对连接，无需管理员再次批准。关闭会使未完成的网页配对失效；已连接设备请通过“撤销互联设备授权”管理。
      </p>
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-3"
      >
        {{ error }}
      </v-alert>
      <v-alert
        v-if="message"
        type="success"
        variant="tonal"
        class="mb-3"
      >
        {{ message }}
      </v-alert>
      <div class="pa-4 mb-4 rounded-lg bg-surface-light">
        <h3 class="text-subtitle-1 mb-2">
          按年级／全校批量设置
        </h3>
        <p class="text-caption mb-3">
          只修改当前学期已存在的有效班级大屏，不自动授权以后新建的大屏。已连接设备不受影响。
        </p>
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
          class="text-caption mb-2"
        >
          请先选择有效的当前学期。
        </p>
        <v-btn
          variant="tonal"
          :disabled="!canPreview"
          @click="previewBatch"
        >
          预览影响范围
        </v-btn>
        <v-sheet
          v-if="preview"
          class="pa-4 mt-3 rounded-lg"
          border
        >
          <h4>{{ preview.termName }} · {{ preview.targetName }} · {{ preview.enabled ? '开放' : '关闭' }}网页配对</h4>
          <p class="my-2">
            有效大屏 {{ preview.totalScreens }} 台：修改 {{ preview.changedScreens }} 台，保持 {{ preview.unchangedScreens }} 台；排除停用或无效项目 {{ preview.excludedScreens }} 台。
          </p>
          <p
            v-if="!preview.enabled && preview.changedScreens"
            class="text-caption mb-2"
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
            class="text-caption"
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
          <div class="d-flex flex-wrap ga-2 mt-3">
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
      </div>
      <v-list
        v-if="loaded"
        bg-color="transparent"
      >
        <v-list-item
          v-for="binding in eligible"
          :key="binding.id"
          :title="`${binding.name} · ${binding.administrativeClass?.name || '班级'}`"
        >
          <template #subtitle>
            {{ policies[binding.id]?.enabled ? '已开放网页配对' : '未开放网页配对' }}
          </template>
          <template #append>
            <v-btn
              :disabled="busy || !policies[binding.id]"
              :color="policies[binding.id]?.enabled ? undefined : 'primary'"
              variant="tonal"
              @click="toggle(binding.id)"
            >
              {{ policies[binding.id]?.enabled ? '关闭网页配对' : '开放网页配对' }}
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
      <p v-if="loaded && !eligible.length">
        请先创建有效班级的大屏账号。
      </p>
    </v-card-text>
  </v-card>
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
