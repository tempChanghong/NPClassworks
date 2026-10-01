import {ref, computed, watch, onScopeDispose} from 'vue';
import {npepNoiseScheduleApi} from '@/utils/classworksV2Client.js';
import {validatePolicy} from '@/utils/schoolNoiseSchedule.js';

const copy = value => JSON.parse(JSON.stringify(value));
const explanation = e => ({
  SCHEDULE_VERSION_CONFLICT: '其他管理员已更新此配置。草稿已保留，请重新加载服务器配置后再修改。',
  TERM_NOT_ACTIVE: '该学期已停用，请选择有效学期。',
  SCHOOL_ADMIN_REQUIRED: '只有学校所有者和管理员可编辑排程。',
  IDEMPOTENCY_CONFLICT: '本次保存标识已用于其他内容，请重新加载并核对配置。',
}[e?.response?.data?.error?.code] || `排程操作失败：${e?.response?.data?.error?.code || e.message}`);

export function useNoiseScheduleEditor(school, initialTerm, api = npepNoiseScheduleApi) {
  const catalog = ref(null), termId = ref(''), targetType = ref('GRADE'), targetId = ref('');
  const draft = ref({mode: 'Disabled', rules: []}), revision = ref(0), preview = ref(null);
  const busy = ref(false), error = ref(''), message = ref(''), loaded = ref(false), blocked = ref(false);
  const targets = computed(() => (targetType.value === 'GRADE' ? catalog.value?.grades : catalog.value?.classes) || []);
  const validation = computed(() => validatePolicy(draft.value, targetType.value === 'GRADE'));
  const valid = computed(() => loaded.value && !!targetId.value && !validation.value && !blocked.value);
  let generation = 0, pending = null, disposed = false;
  const fingerprint = () => JSON.stringify([school.value, termId.value, targetType.value, targetId.value, revision.value, draft.value]);
  function loadTarget() {
    generation++; pending = null; preview.value = null; error.value = ''; message.value = ''; blocked.value = false; busy.value = false;
    const saved = catalog.value?.policies.find(p => p.targetType === targetType.value && p.targetId === targetId.value);
    revision.value = saved?.revision || 0;
    draft.value = copy(saved?.policy || {mode: targetType.value === 'CLASS' ? 'Inherit' : 'Disabled', rules: []});
  }
  async function refresh() {
    const gen = ++generation; busy.value = true; loaded.value = false; error.value = ''; preview.value = null; pending = null;
    try {
      const response = await api.list(school.value, termId.value);
      if (disposed || gen !== generation) return;
      catalog.value = response.data; termId.value = response.data.termId || '';
      targetId.value = targets.value.some(t => t.id === targetId.value) ? targetId.value : targets.value[0]?.id || '';
      loaded.value = true; loadTarget();
    } catch (e) { if (gen === generation && !disposed) error.value = explanation(e); }
    finally { if (gen === generation && !disposed) busy.value = false; }
  }
  function body() { return {termId: termId.value, targetType: targetType.value, targetId: targetId.value, expectedRevision: revision.value, policy: copy(draft.value)}; }
  async function operation(save) {
    if (!valid.value || busy.value) return;
    const gen = generation, snapshot = fingerprint(), selected = body();
    // Keep the same ID/body after an ambiguous network failure. A retry must not write twice.
    if (save && (!pending || pending.snapshot !== snapshot)) pending = {snapshot, body: {...selected, requestId: globalThis.crypto.randomUUID()}};
    busy.value = true; error.value = ''; message.value = '';
    try {
      const response = save ? await api.save(school.value, pending.body) : await api.preview(school.value, selected);
      if (disposed || gen !== generation || snapshot !== fingerprint()) return;
      preview.value = response.data;
      if (save) {
        const index = catalog.value.policies.findIndex(p => p.targetType === selected.targetType && p.targetId === selected.targetId);
        const row = {targetType: selected.targetType, targetId: selected.targetId, policy: selected.policy, revision: response.data.revision, updatedAt: response.data.updatedAt};
        if (index < 0) catalog.value.policies.push(row); else catalog.value.policies[index] = row;
        revision.value = row.revision; pending = null;
        message.value = response.data.executionEnabled
          ? '规则已保存，等待支持排程的桌面确认；请在设备噪音报告中核对实际执行状态。'
          : '规则已保存；当前服务暂未启用下发执行。';
      }
    } catch (e) {
      if (gen !== generation || disposed || snapshot !== fingerprint()) return;
      error.value = explanation(e);
      if (['SCHEDULE_VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(e?.response?.data?.error?.code)) blocked.value = true;
    } finally { if (gen === generation && !disposed) busy.value = false; }
  }
  watch([targetType, targetId], loadTarget, {flush: 'sync'});
  watch(draft, () => { preview.value = null; message.value = ''; pending = null; }, {deep: true, flush: 'sync'});
  watch([school, initialTerm], () => {
    catalog.value = null; targetId.value = ''; termId.value = initialTerm.value || ''; void refresh();
  }, {immediate: true});
  onScopeDispose(() => { disposed = true; generation++; });
  return {catalog, termId, targetType, targetId, targets, draft, revision, preview, busy, error, message, loaded, valid, validation,
    refresh, previewDraft: () => operation(false), save: () => operation(true)};
}
