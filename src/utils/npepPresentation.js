const messages = {
  SCREEN_TOKEN_INVALID: '大屏登录已失效，请重新登录对应班级大屏。',
  SCREEN_PAIRING_DISABLED: '学校尚未开放此大屏的网页配对，请联系管理员。',
  PREAUTHORIZATION_CHANGED: '学校预授权或大屏登录凭据已变化，请刷新并重新生成配对码。',
  PAIRING_CODE_UNAVAILABLE: '配对码已过期、使用或被替换，请重新生成。',
  CLASSISLAND_EXECUTABLE_INVALID: 'ClassIsland 程序位置无效，请在大屏设置中修正。',
  EXAMAWARE_EXECUTABLE_INVALID: 'ExamAware 程序位置无效，请在大屏设置中修正。',
  EXAMAWARE_EXECUTABLE_UNREADABLE: '无法读取 ExamAware 程序文件，请检查路径和权限。',
  CLASSISLAND_CONFIGURATION_REQUIRED: '尚未配置 ClassIsland 程序位置。',
  EXAMAWARE_CONFIGURATION_REQUIRED: '尚未配置 ExamAware 程序或桥接。',
  CLASSISLAND_TASK_REQUIRED: '请先在大屏配置 ClassIsland 管理员自启动任务。',
  RECORDING_SAVE_FAILED: '录制保存失败，请检查录制文件和磁盘后重试。',
  RECORDING_SAVE_TIMEOUT: '等待录制保存超时，请确认保存状态后重试。',
  HOST_NOT_ELEVATED: 'NPEduTools 后台没有管理员权限，请重新启动。',
  STARTUP_NOT_READY: '自启动设置未确认；检查桥接连接与权限后可重试补完。',
  MODE_CONTROL_UNAVAILABLE: '桌面后台尚不支持考试模式切换，请更新并重启后台。',
  UNSUPPORTED_SCOPE: '这是旧版考试环境请求，无法升级为考试模式操作，请重新发起。',
  CONFIGURATION_DRIFT: '大屏上的程序配置已变化，请现场核对后重新发起。',
  EXAMAWARE_NOT_READY: '考试看板未确认就绪，请现场检查程序与桥接连接。',
  CLASSISLAND_EXIT_UNAVAILABLE: 'ClassIsland 未能正常退出，请现场处理。',
  UAC_CANCELLED: '现场取消了 Windows 管理员授权。',
  STORAGE_UNAVAILABLE: '大屏上的执行记录无法读写，请现场检查。',
  EXPIRED: '请求已超过允许开始的时间，请重新核对后发起。',
  AUTH_REVOKED: '许可已撤销或执行被中断，请根据现场状态核实结果。',
  UNKNOWN_RESULT: '执行结果尚未确认，可重新切入；设备会核对实际状态并补完。',
  CONTROL_DISABLED: '设备配对或学校连接尚未生效。', POLICY_CHANGED: '本机许可或控制周期已变化，请刷新后重新核对。',
  CLIENT_UNSUPPORTED: '尚未收到设备的 N3 支持信息，请更新 NPEduTools。', DEVICE_OFFLINE: '设备状态已过时，请等待重新上报。',
  RECORDING_BUSY: '设备正在录制或录制状态未知，不能切换。', DESKTOP_UNAVAILABLE: '大屏桌面暂不可交互。',
  NOTICE_OPEN: '大屏通知尚未关闭。', STATE_CHANGED: '设备状态已变化，请刷新后重新核对。',
  OPERATION_BUSY: '已有切换任务正在执行，请等待结果后再切换目标模式。', RECOVERY_REQUIRED: '上次切换未完成，可重新切入并核查实际状态。',
  EXAMAWARE_PRESENTING: 'ExamAware 正在放映，请先在大屏结束放映，再重试返回日常。',
  EXAMAWARE_EXIT_FAILED: '未确认 ExamAware 正常退出。请处理未保存的编辑器或退出提示后重试。',
  CLASSISLAND_NOT_READY: 'ClassIsland 尚未就绪。请检查管理员任务、首次引导或课程接口后重试。',
  START_ALREADY_AUTHORIZED: '已获开始许可，不能远程取消，请等待结果或现场处理。',
  INITIATOR_NO_LONGER_AUTHORIZED: '原发起人的登录或学校管理权限已失效。',
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
