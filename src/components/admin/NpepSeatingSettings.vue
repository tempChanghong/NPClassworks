<template>
  <section class="seating-settings">
    <h3>自习座位表</h3>
    <p class="text-medium-emphasis mb-4">
      按自习所在班级发布，与作业来源分开。大屏仅通过按钮查看，不自动弹出、不参与轮换。
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
    <v-select
      :model-value="classId"
      :items="classes"
      item-title="name"
      item-value="id"
      label="自习所在班级"
      aria-label="自习所在班级"
      :disabled="busy"
      @update:model-value="changeClass"
    />
    <template v-if="classId">
      <div class="d-flex ga-3 align-center mb-3">
        <span>{{ current.hash ? `当前版本 ${current.revision}` : '尚未发布自习座位表 / 已撤回' }}</span>
        <v-btn
          :disabled="busy"
          variant="text"
          @click="refresh"
        >
          刷新状态
        </v-btn>
        <v-btn
          v-if="current.hash"
          :disabled="busy"
          color="warning"
          variant="text"
          @click="withdraw"
        >
          撤回当前自习座位表
        </v-btn>
      </div>
      <v-file-input
        accept="image/png,image/jpeg"
        label="选择新自习座位表（PNG/JPEG）"
        :disabled="busy"
        :model-value="file"
        @update:model-value="choose"
      />
      <p
        v-if="draft"
        class="text-medium-emphasis"
      >
        待发布 · {{ draft.width }} × {{ draft.height }} · {{ Math.ceil(draft.byteCount / 1024) }} KiB
      </p>
      <img
        v-if="draft?.dataUrl || preview"
        :src="draft?.dataUrl || preview"
        class="seating-preview"
        alt="所选自习座位表预览"
      >
      <div class="d-flex ga-3 my-4">
        <v-btn
          color="primary"
          :disabled="!draft || busy"
          :loading="saving"
          @click="publish('image')"
        >
          发布给此班级
        </v-btn>
        <v-btn
          v-if="draft"
          :disabled="busy"
          variant="text"
          @click="discardDraft"
        >
          取消新图
        </v-btn>
      </div>
      <p class="text-medium-emphasis">
        发布不等于设备已展示。设备在线且自习配置有效时读取；正在查看旧图时，关闭后切换新图。仅保留最近五次发布的图片，较早版本只保留操作记录。
      </p>
      <v-list
        v-if="versions.length"
        class="my-3"
      >
        <v-list-item
          v-for="v in versions"
          :key="v.revision"
          :title="`版本 ${v.revision} · ${v.hash ? '图片' : '撤回'}`"
          :subtitle="new Date(v.createdAt).toLocaleString('zh-CN')"
        >
          <template #append>
            <v-btn
              v-if="v.restorable && v.revision !== current.revision"
              :disabled="busy || !!draft"
              variant="text"
              @click="restore(v.revision)"
            >
              重新发布此图
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
      <h4>设备展示观测</h4>
      <p
        v-if="!receipts.length"
        class="text-medium-emphasis"
      >
        尚无设备回执，不能判断已下载或展示。
      </p>
      <v-list v-else>
        <v-list-item
          v-for="r in receipts"
          :key="r.deviceId"
          :title="r.deviceId"
          :subtitle="receiptText(r)"
        />
      </v-list>
    </template>
  </section>
</template>
<script setup>
import {computed, onUnmounted, ref, watch} from 'vue';
import {npepSeatingApi} from '@/utils/classworksV2Client';
import {npepErrorMessage} from '@/utils/npepPresentation';
import {normalizeSeatingImage} from '@/utils/seatingImage';
import {confirmAction} from '@/utils/actionDialog';
const props = defineProps({schoolId: {type: String, required: true}, termId: {type: String, default: ''}});
const emit = defineEmits(['dirty']);
const classes = ref([]), classId = ref(null), activeTerm = ref(null), current = ref({revision: 0, hash: null}), versions = ref([]), receipts = ref([]);
const draft = ref(null), file = ref(null), preview = ref(null), error = ref(''), message = ref(''), loading = ref(false), saving = ref(false);
const busy = computed(() => loading.value || saving.value);
let generation = 0, imageGeneration = 0, controller, pendingWrite;
watch(draft, value => emit('dirty', Boolean(value)), {flush: 'sync'});
onUnmounted(() => { generation++; imageGeneration++; controller?.abort(); emit('dirty', false); });
function discardDraft() { imageGeneration++; draft.value = file.value = null; pendingWrite = null; }
async function changeClass(value) {
  if (value === classId.value) return;
  if (draft.value && !await confirmAction({title: '放弃待发布自习座位表？', message: '新图尚未发布。切换班级后清除当前草稿。', confirmText: '放弃并切换', color: 'warning'})) return;
  discardDraft(); classId.value = value; await refresh();
}
async function choose(value) {
  const selected = Array.isArray(value) ? value[0] : value;
  const n = ++imageGeneration; file.value = selected; draft.value = null; pendingWrite = null; error.value = '';
  if (!selected) return;
  try { const result = await normalizeSeatingImage(selected); if (n === imageGeneration) draft.value = result; }
  catch (e) { if (n === imageGeneration) { error.value = e.message || '无法读取自习座位表。'; file.value = null; } }
}
async function refresh() {
  const n = ++generation; controller?.abort(); controller = new AbortController(); loading.value = true; error.value = '';
  try {
    if (!activeTerm.value) {
      const result = (await npepSeatingApi.catalog(props.schoolId, props.termId || undefined, {signal: controller.signal})).data;
      if (n !== generation) return;
      classes.value = result.classes; activeTerm.value = result.termId;
    }
    if (!classId.value) return;
    const params = {termId: activeTerm.value, classId: classId.value};
    const result = (await npepSeatingApi.list(props.schoolId, params, {signal: controller.signal})).data;
    if (n !== generation) return;
    current.value = result.current; versions.value = result.versions; receipts.value = result.receipts; preview.value = null;
    if (result.current.hash) {
      const image = (await npepSeatingApi.image(props.schoolId, {...params, revision: result.current.revision}, {signal: controller.signal})).data;
      if (n === generation) preview.value = `data:image/png;base64,${image.image}`;
    }
  } catch (e) { if (n === generation && e.code !== 'ERR_CANCELED') error.value = npepErrorMessage(e); }
  finally { if (n === generation) loading.value = false; }
}
async function publish(action, restoreRevision) {
  if (busy.value || !classId.value) return;
  const n = generation;
  if (pendingWrite && (pendingWrite.action !== action || action === 'restore' && pendingWrite.restoreRevision !== restoreRevision)) pendingWrite = null;
  const body = pendingWrite || {requestId: globalThis.crypto.randomUUID(), termId: activeTerm.value, classId: classId.value, expectedRevision: current.value.revision, action,
    ...(action === 'image' ? {image: draft.value.image} : {}), ...(action === 'restore' ? {restoreRevision} : {})};
  pendingWrite = body; saving.value = true; error.value = ''; message.value = '';
  try {
    await npepSeatingApi.publish(props.schoolId, body);
    if (n !== generation) return;
    discardDraft(); message.value = '发布已保存。设备下载与实际展示请分别核对回执。'; await refresh();
  } catch (e) { if (n === generation) { error.value = `发布结果未确认：${npepErrorMessage(e)}`;
      if (e.response?.data?.error?.code === 'SEATING_CHANGED') pendingWrite = null; } }
  finally { saving.value = false; }
}
async function withdraw() {
  if (draft.value) return;
  if (await confirmAction({title: '撤回此自习座位表？', message: '在线设备收到更新后清除图片；离线设备的图片可用状态会在短时缓存到期后失效。', confirmText: '撤回', color: 'warning'})) await publish('withdraw');
}
async function restore(revision) { if (await confirmAction({title: '重新发布历史自习座位表？', message: '将生成更大的新版本号，设备不会倒退版本。', confirmText: '重新发布'})) await publish('restore', revision); }
function receiptText(r) {
  if (!r.fresh) return r.downloaded ? 'Host 已下载；尚无新鲜展示端回执' : '观测已过期或设备已失去当前授权，请刷新核对';
  if (!r.current) return r.downloaded ? 'Host 已下载新图 · 展示端尚未应用 / 旧图待关闭切换' : '当前发布尚未下载或应用';
  return r.visible && r.renderAgeMs !== null ? '最近观测：用户已打开自习座位表（需现场验收）' : '展示端已应用，当前未查看';
}
watch(() => `${props.schoolId}/${props.termId}`, () => { discardDraft(); activeTerm.value = classId.value = null; classes.value = []; current.value = {revision: 0, hash: null}; versions.value = receipts.value = []; preview.value = null; void refresh(); }, {immediate: true});
</script>
<style scoped>
.seating-preview { display: block; max-width: 100%; max-height: 520px; object-fit: contain; margin-top: 16px; background: white; border-radius: 8px; }
</style>
