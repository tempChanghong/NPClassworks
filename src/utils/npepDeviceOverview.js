export const overviewIssueName = code => ({
  UNREPORTED: '尚未收到有效上报', OFFLINE: '最近一分钟未收到上报', MODE_NOT_READY: '模式未知或尚未配置',
  MODE_INCOMPLETE: '模式切换未完成或不可用', RECORDING_UNKNOWN: '录制状态未知',
  CLASSISLAND_NOT_CONNECTED: '日常模式下课程桥接未连接', EXAMAWARE_NOT_CONNECTED: '考试模式下看板桥接未连接',
}[code] || '状态需核对');

export function readDeviceOverview(data) {
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const summary = data?.summary;
  if (!summary || !['total', 'active', 'online', 'offline', 'unreported', 'attention', 'inactive'].every(key => count(summary[key])) ||
      summary.total !== summary.active + summary.inactive || summary.active !== summary.online + summary.offline + summary.unreported ||
      summary.attention > summary.active || !Number.isFinite(Date.parse(data.asOf)) || !count(data.matchedTotal) ||
      data.matchedTotal > summary.total || !Array.isArray(data.items) || data.items.length > data.matchedTotal ||
      !data.items.every(item => typeof item.deviceId === 'string' && Array.isArray(item.issues)) ||
      !(data.nextCursor === null || typeof data.nextCursor === 'string')) throw new Error('Invalid device overview');
  return data;
}
