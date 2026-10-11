import {computed, onScopeDispose, ref, watch} from 'vue';
import {npepStudySettingsApi} from '@/utils/classworksV2Client.js';
import {defaultStudySettings, normalizeStudyPolicy, validateStudyPolicy, validStudyDate} from '@/utils/npepStudySettings.js';

const copy = value => JSON.parse(JSON.stringify(value));
const explanation = cause => ({
  STUDY_SETTING_VERSION_CONFLICT: '其他管理员已更新设置。草稿已保留，请重新加载后核对。',
  STUDY_SETTING_UPGRADE_REQUIRED: '当前班级已有双阈值或自定义提醒间隔。请更新管理页面后重新加载，原配置未被覆盖。',
  STUDY_PREVIEW_CHANGED: '范围或其他班级设置已改变。草稿已保留，请重新预览影响后再保存。',
  IDEMPOTENCY_CONFLICT: '本次保存标识与已受理内容不一致。草稿已保留，请重新加载后核对。',
  STUDY_SOURCE_UNAVAILABLE: '作业来源班级已停用或不属于当前学校、学期，请重新核对。',
  TERM_NOT_ACTIVE: '所选学期尚未启用或已停用。',
  SCHOOL_ADMIN_REQUIRED: '只有学校 OWNER 和 ADMIN 可以管理自习设置。',
  PROTOCOL_UNSUPPORTED: '当前服务尚未支持自习设置，请先完成后台接口部署。',
}[cause?.response?.data?.error?.code] || `自习设置操作失败：${cause?.response?.data?.error?.code || cause.message}`);

export function useStudySettingsEditor(schoolId, initialTerm, api = npepStudySettingsApi) {
  const catalog = ref(null), termId = ref(''), targetType = ref('GRADE'), targetId = ref('');
  const draft = ref({mode: 'Disabled', settings: null}), baseline = ref(''), revision = ref(0);
  const preview = ref(null), previewDate = ref(''), busy = ref(false), loaded = ref(false);
  const error = ref(''), message = ref(''), blocked = ref(false);
  const targets = computed(() => (targetType.value === 'GRADE' ? catalog.value?.grades : catalog.value?.classes) || []);
  const hasUnsavedChanges = computed(() => loaded.value && !!targetId.value && JSON.stringify(draft.value) !== baseline.value);
  const validation = computed(() => validateStudyPolicy(draft.value, targetType.value === 'GRADE'));
  const valid = computed(() => loaded.value && !!targetId.value && !validation.value && !blocked.value);
  let generation = 0, disposed = false, pending = null, cachedSettings = null;
  const fingerprint = () => JSON.stringify([schoolId.value, termId.value, targetType.value, targetId.value, revision.value, draft.value]);
  function loadTarget() {
    generation++; pending = null; cachedSettings = null; error.value = ''; message.value = ''; preview.value = null; blocked.value = false;
    const saved = catalog.value?.settings.find(row => row.targetType === targetType.value && row.targetId === targetId.value);
    revision.value = saved?.revision || 0;
    draft.value = copy(normalizeStudyPolicy(saved?.policy || {mode: targetType.value === 'CLASS' ? 'Inherit' : 'Disabled', settings: null}));
    baseline.value = JSON.stringify(draft.value);
    previewDate.value = draft.value.settings?.schedule.effectiveFrom || '';
  }
  function changeMode(mode) {
    if (draft.value.settings) cachedSettings = copy(draft.value.settings);
    draft.value = {mode, settings: mode === 'Override' ? copy(cachedSettings || defaultStudySettings()) : null};
  }
  async function refresh() {
    const gen = ++generation; busy.value = true; error.value = ''; message.value = ''; preview.value = null;
    try {
      const result = await api.list(schoolId.value, termId.value);
      if (disposed || gen !== generation) return;
      if (!Array.isArray(result.data.settings) || !Array.isArray(result.data.grades) || !Array.isArray(result.data.classes)) throw new Error('服务器返回的配置范围不完整');
      catalog.value = result.data; termId.value = result.data.termId || '';
      targetId.value = targets.value.some(target => target.id === targetId.value) ? targetId.value : targets.value[0]?.id || '';
      loadTarget(); loaded.value = true; busy.value = false;
    } catch (cause) { if (gen === generation && !disposed) { error.value = explanation(cause); busy.value = false; } }
  }
  function body() {
    return {termId: termId.value, targetType: targetType.value, targetId: targetId.value, expectedRevision: revision.value, policy: copy(draft.value)};
  }
  async function operation(save) {
    if (!valid.value || busy.value || save && !preview.value || !save && previewDate.value && !validStudyDate(previewDate.value)) return;
    const gen = generation, snapshot = fingerprint(), date = previewDate.value;
    const selected = body();
    if (save && (!pending || pending.snapshot !== snapshot)) pending = {snapshot, body: {...selected,
      expectedPreviewFingerprint: preview.value.previewFingerprint, requestId: globalThis.crypto.randomUUID()}};
    busy.value = true; error.value = ''; message.value = '';
    try {
      const result = save ? await api.save(schoolId.value, pending.body) : await api.preview(schoolId.value,
        {...selected, requestId: globalThis.crypto.randomUUID(), ...(date ? {previewDate: date} : {})});
      if (disposed || gen !== generation || snapshot !== fingerprint() || !save && date !== previewDate.value) return;
      preview.value = result.data;
      if (save) {
        const row = {targetType: selected.targetType, targetId: selected.targetId, policy: selected.policy, revision: result.data.revision};
        const index = catalog.value.settings.findIndex(item => item.targetType === row.targetType && item.targetId === row.targetId);
        if (index < 0) catalog.value.settings.push(row); else catalog.value.settings[index] = row;
        revision.value = row.revision; baseline.value = JSON.stringify(selected.policy); pending = null;
        message.value = '自习设置已保存。保存不代表设备已应用、展示页已显示或正在采集；请查看设备回执与执行状态。启用拍照后，请在报告中核对捕获及上传状态。';
      }
    } catch (cause) {
      if (disposed || gen !== generation || snapshot !== fingerprint()) return;
      error.value = explanation(cause);
      if (cause?.response?.data?.error?.code === 'STUDY_PREVIEW_CHANGED') { preview.value = null; pending = null; }
      if (['STUDY_SETTING_VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(cause?.response?.data?.error?.code)) blocked.value = true;
    } finally { if (gen === generation && !disposed) busy.value = false; }
  }
  watch([targetType, targetId], loadTarget, {flush: 'sync'});
  watch([draft, previewDate], () => { preview.value = null; message.value = ''; }, {deep: true, flush: 'sync'});
  watch([schoolId, initialTerm], () => {
    generation++; catalog.value = null; loaded.value = false; targetId.value = ''; termId.value = initialTerm.value || '';
    if (schoolId.value) void refresh();
  }, {immediate: true});
  onScopeDispose(() => { disposed = true; generation++; });
  return {catalog, termId, targetType, targetId, targets, draft, revision, preview, previewDate, busy, loaded, error, message,
    hasUnsavedChanges, validation, valid, changeMode, refresh, previewDraft: () => operation(false), save: () => operation(true)};
}
