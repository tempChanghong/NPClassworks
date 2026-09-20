const messages = {
  AUTH_INVALID: "登录已失效，请重新登录后操作。", SCHOOL_ADMIN_REQUIRED: "当前账号没有这所学校的管理权限。",
  APPROVER_NO_LONGER_AUTHORIZED: "原批准人的授权已失效，请重新发起配对。",
  NOT_FOUND: "未找到对应申请或设备，请核对短码和学校。", PAIRING_EXPIRED: "配对申请已过期，请在设备上重新申请。",
  PAIRING_STATE_CONFLICT: "申请状态已变化，请在设备上查看结果；需要更改时重新申请。",
  BINDING_OCCUPIED: "该大屏已关联一台互联设备，请先核实并撤销原登记。", BINDING_CHANGED: "大屏绑定或班级状态已变化，请重新核对。",
  REVISION_CONFLICT: "设备绑定已变化，请刷新列表后重新操作。", IDEMPOTENCY_CONFLICT: "本次操作内容已变化，请重新核对。",
  INSTANCE_MISMATCH: "互联服务身份已变化，请重新打开面板并核对。", PROTOCOL_UNSUPPORTED: "当前互联协议不兼容，请升级后再试。",
  TEMPORARILY_UNAVAILABLE: "互联服务未启用或暂时不可用，请联系服务管理员。", CAPABILITY_DENIED: "当前仅支持查看设备状态。",
  INVALID_REQUEST: "提交内容无效，请核对后重试。",
};
export function npepErrorMessage(error) {
  const detail = error?.response?.data?.error;
  if (detail?.code === "RATE_LIMITED") return `操作过于频繁，请${Number.isInteger(detail.retryAfterSeconds) ? `等待 ${detail.retryAfterSeconds} 秒后` : '稍后'}重试。`;
  return messages[detail?.code] || (error?.response?.status === 404 ? "当前服务器尚未提供 NPEP 互联服务。" : "操作未能完成，请刷新核对结果后重试。");
}
export function npepConnectivity(device, now) {
  if (device.state !== "ACTIVE") return "不在授权中";
  if (!device.lastSeenAt) return "尚未上报";
  if (!Number.isFinite(Date.parse(device.lastSeenAt))) return "观测时间未知";
  if (device.connectivity !== "ONLINE") return "已失联";
  if (now - Date.parse(device.lastSeenAt) > 60000) return "观测已过时，请刷新";
  return "在线";
}
export const npepStateName = value => ({ACTIVE: "已授权", REVOKED: "已撤销", EXPIRED: "凭据已过期", INVALIDATED: "绑定已失效"}[value] || "未知状态");
export const npepModeName = value => ({DAILY: "日常模式", EXAM: "考试模式", UNCONFIGURED: "尚未配置", UNKNOWN: "未知"}[value] || "未知");
export const npepRecordingName = value => ({IDLE: "未录制", RECORDING: "录制中", PAUSED: "已暂停", FINALIZING: "正在保存", UNKNOWN: "未知"}[value] || "未知");
export const npepAutomaticName = value => ({ENABLED: "已启用", DISABLED: "未启用", UNKNOWN: "未知"}[value] || "未知");
