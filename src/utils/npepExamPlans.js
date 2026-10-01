export const planStateName = state => ({QUEUED: '等待设备校验', PREPARED: '校验通过，等待确认放映', START_REQUESTED: '等待设备处理放映请求',
  START_AUTHORIZED: '已授权设备启动，等待回执', STARTED: '启动已受理', FAILED: '未完成', UNKNOWN: '结果未知，请现场核实',
  EXPIRED: '已失效，请重新投递', CANCELLED: '已取消'}[state] || '未知');
export const planReason = code => ({EXAM_MODE_REQUIRED: '请先通过“考试模式”完成环境切换。', CONTROL_DISABLED: '请在设备“设置 → 学校互联”允许学校考试方案放映。',
  PLAYER_BUSY: '已有放映；请在 ExamAware 中结束后再试，不会替换现有放映。', PLAYER_UNKNOWN: '无法确认播放器状态，请检查桥接权限。',
  BRIDGE_DISCONNECTED: 'ExamAware 桥接未连接。', BRIDGE_UPGRADE_REQUIRED: '请安装桥接 0.4.0 或兼容版本并授权放映权限。',
  RECORDING_BUSY: '正在录制，请先处理录制任务。', DESKTOP_UNAVAILABLE: '当前桌面不可交互。', OPERATION_BUSY: '设备正在处理其他操作。',
  INVALID_PLAN: '方案无效，请用 ExamAware 编辑器检查文件。', PLAN_EXPIRED: '校验结果已失效，请重新投递。',
  LOCAL_REQUEST_REJECTED: '设备拒绝了本次请求，请检查本机程序配置和状态。', UNKNOWN_RESULT: '未确认执行结果，请现场核实；系统不会自动再次放映。',
  STATE_CHANGED: '设备状态已变化，请刷新后重新操作。', BRIDGE_COMMAND_LIMIT: '桥接命令已达本次上限，请在 ExamAware 重新启用插件。',
  PLAYER_PERMISSION_DENIED: '桥接缺少放映权限。', INITIATOR_NO_LONGER_AUTHORIZED: '发起管理员的授权已失效。'}[code] || (code ? `原因：${code}` : ''));
export const planTerminal = op => ['STARTED', 'FAILED', 'UNKNOWN', 'EXPIRED', 'CANCELLED'].includes(op?.state);
export function planBlocked(view, serverNow) {
  if (!view?.status || !view.online || serverNow - Date.parse(view.receivedAt) >= 45000) return '设备观测已过时或尚未连接，请刷新并核对现场。';
  if (!view.status.enabled) return planReason('CONTROL_DISABLED');
  if (!view.status.available) return planReason(view.status.blockReason || 'OPERATION_BUSY');
  return '';
}
export function planCanStart(view, op, serverNow) {
  return !planBlocked(view, serverNow) && op?.state === 'PREPARED' && !!op.summary &&
    view.status.preparedId === op.summary.preparationId && view.status.player?.known === true && view.status.player.sessions.length === 0 &&
    Date.parse(op.expiresAt) > serverNow;
}
export function planPlayback(view, op, serverNow) {
  if (!view?.online || serverNow - Date.parse(view.receivedAt) >= 45000) return '观测过时，当前放映状态未知';
  if (!view.status?.player?.known) return '播放器状态未知';
  if (!op?.sessionId) return '本任务尚无放映会话回执';
  const player = view.status.player;
  const session = player.sessions.find(s => s.id === op.sessionId) || (player.lastSession?.id === op.sessionId ? player.lastSession : null);
  return session ? ({preparing: '正在准备', opening: '正在打开窗口', ready: '放映已就绪', closing: '正在关闭', closed: '放映已结束', failed: '放映失败'}[session.state] || '状态未知') : '当前观测中未找到该放映会话';
}
export async function readExamPlan(file) {
  if (!file || file.size < 1 || file.size > 24576 || file.name.length > 160) throw new Error('请选择不超过 24 KiB、文件名不超过 160 字的 UTF-8 考试方案。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = JSON.parse(new globalThis.TextDecoder('utf-8', {fatal: true}).decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('考试方案必须是 JSON 对象。');
  return {fileName: file.name, dataBase64: btoa(String.fromCharCode(...bytes))};
}
