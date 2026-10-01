import {computed, onUnmounted, ref, watch} from 'vue';
import {npepExamPlanApi} from '@/utils/classworksV2Client';
import {planBlocked, planCanStart, planReason, planTerminal, readExamPlan} from '@/utils/npepExamPlans';

export function useNpepExamPlans(schoolId, deviceId) {
  const view = ref(null), busy = ref(false), error = ref(''), file = ref(null), readingFile = ref(false), pending = ref(null), now = ref(0);
  let generation = 0, selection = 0, controller = new AbortController(), reading = false, received = 0, serverTime = 0;
  const blocked = computed(() => planBlocked(view.value, now.value));
  const active = computed(() => view.value?.items?.find(op => !planTerminal(op)));
  const canSend = computed(() => !busy.value && !readingFile.value && !!file.value && !blocked.value && !active.value && !pending.value);
  const canStart = op => !busy.value && !pending.value && planCanStart(view.value,
    view.value?.items?.find(item => item.operationId === op?.operationId && item.summary?.preparationId === op.summary?.preparationId), now.value);
  async function refresh() {
    if (reading || busy.value || !schoolId.value || !deviceId.value) return;
    const own = generation; reading = true;
    try {
      const reply = await npepExamPlanApi.status(schoolId.value, deviceId.value, {signal: controller.signal});
      if (own !== generation) return;
      view.value = reply.data; serverTime = Date.parse(reply.serverTime); received = globalThis.performance.now(); now.value = serverTime;
    } catch (e) { if (own === generation) { view.value = null; error.value = message(e); } }
    finally { if (own === generation) reading = false; }
  }
  const message = e => e.response?.status === 426 || e.response?.status === 404 ? '服务端尚未启用考试方案接口，请先在本地应用新迁移并重启后端。' : planReason(e.response?.data?.error?.code) || e.message || '连接失败';
  async function choose(value) {
    const own = ++selection; file.value = null; error.value = ''; readingFile.value = true;
    try { const result = await readExamPlan(Array.isArray(value) ? value[0] : value); if (own === selection) file.value = result; }
    catch (e) { if (own === selection && value) error.value = e.message; }
    finally { if (own === selection) readingFile.value = false; }
  }
  async function execute(intent) {
    if (busy.value) return;
    const own = ++generation;
    controller.abort(); controller = new AbortController(); reading = false;
    busy.value = true; error.value = ''; pending.value = intent;
    try {
      const args = [schoolId.value, deviceId.value];
      if (intent.action !== 'create') args.push(intent.operationId);
      if (intent.action !== 'cancel') args.push(intent.body);
      args.push({signal: controller.signal, requestId: intent.requestId});
      await npepExamPlanApi[intent.action](...args);
      if (own === generation) { pending.value = null; if (intent.action === 'create') file.value = null; }
    } catch (e) {
      if (own === generation) {
        error.value = message(e);
        if (e.response?.status >= 400 && e.response.status < 500 && e.response.status !== 429) pending.value = null;
      }
    } finally { if (own === generation) { busy.value = false; await refresh(); } }
  }
  const create = () => {
    if (!canSend.value) return;
    const s = view.value.status;
    return execute({action: 'create', requestId: globalThis.crypto.randomUUID(), body: {...file.value, context: JSON.parse(JSON.stringify(view.value.context)),
      consentId: s.consentId, policyRevision: s.policyRevision, revision: s.revision}});
  };
  const start = op => {
    if (!canStart(op)) return;
    return execute({action: 'start', operationId: op.operationId, requestId: globalThis.crypto.randomUUID(), body: {preparationId: op.summary.preparationId, sha256: op.sha256}});
  };
  const cancel = op => {
    if (busy.value || pending.value || op.grant || planTerminal(op)) return;
    return execute({action: 'cancel', operationId: op.operationId, requestId: globalThis.crypto.randomUUID()});
  };
  const retry = () => pending.value && execute(pending.value);
  function reset() {
    generation++; selection++; controller.abort(); controller = new AbortController(); reading = false;
    view.value = null; file.value = null; pending.value = null; error.value = ''; busy.value = false; readingFile.value = false;
  }
  watch([schoolId, deviceId], () => { reset(); void refresh(); }, {immediate: true, flush: 'sync'});
  const timer = setInterval(() => { now.value = serverTime + globalThis.performance.now() - received; }, 1000);
  const poll = setInterval(() => { void refresh(); }, 10000);
  onUnmounted(() => { reset(); clearInterval(timer); clearInterval(poll); });
  return {view, busy, error, file, pending, now, blocked, canSend, canStart, refresh, choose, create, start, cancel, retry};
}
