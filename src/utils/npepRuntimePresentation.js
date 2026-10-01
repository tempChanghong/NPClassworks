export const runtimeStateName = (state, target = 'EXAM') => ({QUEUED: '等待大屏领取', RECEIVED: '大屏已接收', CHECKING: '正在检查',
  START_AUTHORIZED: '已批准开始，等待设备结果', RUNNING: '正在切换', WAITING_LOCAL: '等待现场处理',
  SUCCEEDED: target === 'DAILY' ? '已返回日常模式' : '考试环境已就绪', REJECTED: '未执行，可修复后重试', FAILED: '执行失败，可重试', PARTIAL: '切换未完成，可重试补完',
  UNKNOWN: '结果未知，可重新核查并重试', CANCELLED: '已取消', EXPIRED: '已过开始期限'}[state] || '状态未知');

export const runtimeModeName = mode => ({EXAM: '考试环境', DAILY: '日常模式', OTHER: '其他运行环境', UNKNOWN: '尚未确认'}[mode] || '尚未确认');
export const runtimeStepName = step => ({PAUSE_RECORDING: '暂停后续自动录课', PREPARE_EXAM: '准备考试看板',
  SET_STARTUP: '设置目标模式自启动', CLOSE_CLASSISLAND: '正常退出 ClassIsland', VERIFY: '核实运行结果',
  CLOSE_EXAM: '正常退出 ExamAware2', START_CLASSISLAND: '启动并等待 ClassIsland 就绪',
  Check: '核对当前环境', PauseRecording: '正在保存录制并暂停后续录课', PrepareExam: '准备考试看板',
  SetStartup: '设置目标模式自启动', CloseClassIsland: '正常退出 ClassIsland', CloseExam: '正常退出 ExamAware2',
  StartClassIsland: '启动并等待 ClassIsland 就绪', Verify: '核实运行结果'}[step] || '等待设备回执');
export function runtimeEvidence(evidence) {
  if (!evidence) return [];
  return [
    `考试看板：${({READY: '已就绪', EXITED: '已退出', NOT_READY: '未就绪', UNKNOWN: '尚未确认'})[evidence.examAware] || '尚未确认'}`,
    `ClassIsland：${({EXITED: '已退出', READY: '已就绪', RUNNING: '仍在运行', UNKNOWN: '尚未确认'})[evidence.classIsland] || '尚未确认'}`,
    `自动录课：${evidence.remoteExamPause === true ? '远程考试暂停已建立' : evidence.remoteExamPause === false ? '未保留远程考试暂停' : '尚未确认'}`,
    `Windows 自启动：${({NOT_REQUESTED: '未请求修改', EXAM_MODE_APPLIED: 'ClassIsland 已关闭，ExamAware2 已开启', DAILY_MODE_APPLIED: 'ClassIsland 已开启，ExamAware2 已关闭', UNKNOWN: '尚未确认，请现场核实'})[evidence.startup] || '尚未确认'}`,
  ];
}

export function runtimeBlockedReason(snapshot, serverNow, target = 'EXAM') {
  if (!snapshot?.policy?.supported) return '尚未收到大屏的 N3 支持信息，请更新并连接 NPEduTools。';
  if (!snapshot.policy.pairedExamControl) return '请更新 NPEduTools：当前客户端尚不支持配对授权与可恢复考试切换。';
  if (target === 'DAILY' && !snapshot.policy.remoteDailyControl) return '请更新并重启 NPEduTools 后台，当前版本尚不支持远程返回日常。';
  if (!snapshot.policy.enabled) return '设备尚未完成有效学校配对，或学校连接已暂停。';
  const age = serverNow - Date.parse(snapshot.sampleAsOf);
  if (snapshot.connectivity !== 'ONLINE' || !Number.isFinite(age) || age < 0 || age > 60000) return '设备状态已过时或已离线，请等待新的上报。';
  const s = snapshot.status;
  if (!snapshot.controlEpoch || !s || s.modeRevision === null) return '设备信息不完整，请刷新后重试。';
  return '';
}

export function runtimeCreateBody(snapshot, target = 'EXAM') {
  if (!['EXAM', 'DAILY'].includes(target)) throw new Error('不支持的目标模式');
  const s = snapshot.status, p = snapshot.policy;
  return {target, scope: 'EXAM_MODE', expectedRuntimeRevision: s.runtimeRevision,
    expectedModeRevision: s.modeRevision, expectedConfigurationRevision: s.configurationRevision,
    consentId: p.consentId, policyRevision: p.policyRevision, controlEpoch: snapshot.controlEpoch};
}
