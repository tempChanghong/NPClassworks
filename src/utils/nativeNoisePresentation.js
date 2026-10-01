export const time = value => value ? new Date(value).toLocaleString('zh-CN') : '尚无';
export const stateName = state => ({Idle: '未开始', Starting: '启动中', Active: '监测中', Stopping: '停止中', Stopped: '已停止', Faulted: '采集异常'}[state] || '未知');
// Presentation thresholds match the desktop: -100 is the trend bound, not a calibrated noise threshold.
export const numericalFloorDbfs = -160;
export const trendMinimumDbfs = -100;
export const weakSignal = value => Number.isFinite(value) && value <= trendMinimumDbfs;
export const level = value => !Number.isFinite(value) ? '—' : value <= numericalFloorDbfs ? '≤ -160.0' : value.toFixed(1);
export const statistic = value => !Number.isFinite(value) ? '无有效值' : `${level(value)} dBFS${value <= numericalFloorDbfs ? '（数值下限）' : ''}`;
export const qualityName = (quality, value) => quality === 'Good'
  ? weakSignal(value) ? '输入接近静音' : '采样有效'
  : ({Waiting: '等待采样', DigitalSilence: '全零信号，检查静音', Clipping: '削波', Invalid: '采样无效', NoData: '没有新数据'}[quality] || '未知');
export const signalHint = value => !weakSignal(value) ? ''
  : `${value <= numericalFloorDbfs ? '已达到数值下限；更低的输入不再显示精确读数。' : ''}当前输入接近静音，可能受到静音或降噪处理影响；请通过说话确认输入响应。`;
export const receiptName = state => ({ACCEPTED: '桌面已受理，以运行状态为准', REJECTED: '桌面拒绝', UNKNOWN: '执行结果未知'}[state] || '等待回执');
