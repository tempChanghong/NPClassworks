import {computed, onUnmounted, ref, watch} from 'vue';
import {npepRuntimeApi} from '@/utils/classworksV2Client';
import {npepErrorMessage} from '@/utils/npepPresentation';
import {runtimeBlockedReason, runtimeCreateBody} from '@/utils/npepRuntimePresentation';

export function useNpepRuntimeControl(schoolId, deviceId) {
  const snapshot = ref(null), operations = ref([]), busy = ref(false), error = ref(''), message = ref('');
  const confirmed = ref(false), pending = ref(null), serverNow = ref(0);
  let controller = new AbortController(), generation = 0, reading = false, received = 0, serverTime = 0;
  let mutationError = '';
  const blocked = computed(() => runtimeBlockedReason(snapshot.value, serverNow.value));
  const dailyBlocked = computed(() => runtimeBlockedReason(snapshot.value, serverNow.value, 'DAILY'));
  async function refresh() {
    if (reading || busy.value || !schoolId.value || !deviceId.value) return;
    const own = generation;
    reading = true;
    try {
      const options = {signal: controller.signal};
      const [status, history] = await Promise.all([npepRuntimeApi.status(schoolId.value, deviceId.value, options), npepRuntimeApi.operations(schoolId.value, deviceId.value, options)]);
      if (own !== generation || busy.value) return;
      snapshot.value = status.data; operations.value = history.data.items;
      serverTime = Date.parse(status.serverTime); received = globalThis.performance.now(); serverNow.value = serverTime;
      // Observing the device successfully does not make the last control request succeed.
      error.value = mutationError;
    } catch (e) {
      if (own === generation && !busy.value) { snapshot.value = null; error.value = npepErrorMessage(e); }
    } finally { if (own === generation) reading = false; }
  }
  async function mutate(action) {
    if (busy.value) return;
    busy.value = true; error.value = ''; message.value = ''; mutationError = '';
    const own = ++generation;
    controller.abort(); controller = new AbortController(); reading = false;
    try { await action(controller.signal, () => own === generation); }
    catch (e) { if (own === generation) error.value = mutationError = npepErrorMessage(e); }
    finally { if (own === generation) { busy.value = false; await refresh(); } }
  }
  const create = (target = 'EXAM') => {
    if (!['EXAM', 'DAILY'].includes(target) || (pending.value && pending.value.body.target !== target)) return;
    if (!pending.value && (!confirmed.value || (target === 'DAILY' ? dailyBlocked.value : blocked.value))) return;
    pending.value ??= {requestId: globalThis.crypto.randomUUID(), body: runtimeCreateBody(snapshot.value, target)};
    const intent = pending.value;
    return mutate(async (signal, current) => {
      let reply;
      try { reply = await npepRuntimeApi.create(schoolId.value, deviceId.value, intent.body, {signal, requestId: intent.requestId}); }
      catch (e) {
        if (current() && e.response?.status >= 400 && e.response.status < 500 && e.response.status !== 429) { pending.value = null; confirmed.value = false; }
        throw e;
      }
      if (!current()) return;
      pending.value = null; confirmed.value = false;
      message.value = `请求已登记（${reply.data.operationId}），请根据大屏回执确认结果。`;
    });
  };
  const cancel = operation => mutate(async (signal, current) => {
    await npepRuntimeApi.cancel(schoolId.value, deviceId.value, operation.operationId, {signal});
    if (current()) message.value = '已核对取消结果。已获开始许可的操作不能远程取消，请现场处理。';
  });
  function clear() {
    generation++; controller.abort(); controller = new AbortController(); reading = false;
    busy.value = false; snapshot.value = null; operations.value = []; pending.value = null;
    confirmed.value = false; error.value = ''; message.value = ''; mutationError = '';
  }
  watch([schoolId, deviceId], () => { clear(); void refresh(); }, {immediate: true, flush: 'sync'});
  const clock = setInterval(() => { serverNow.value = serverTime + (globalThis.performance.now() - received); }, 1000);
  const poll = setInterval(() => { void refresh(); }, 10000);
  onUnmounted(() => { clear(); clearInterval(clock); clearInterval(poll); });
  return {snapshot, operations, busy, error, message, confirmed, pending, blocked, dailyBlocked, refresh, create, cancel};
}
