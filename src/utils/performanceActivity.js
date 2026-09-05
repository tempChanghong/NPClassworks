// 浏览器没有可靠的跨平台休眠信号；超长采样间隔单列，不能直接认定为主线程卡顿。
export function createPerformanceActivity({
  now = () => globalThis.performance.now(),
  wallNow = () => Date.now(),
  visible = true,
  interval = 30_000,
  maxGap = 120_000,
} = {}) {
  let active = visible;
  let foregroundSince = now();
  let lastTick = foregroundSince;
  let lastWall = wallNow();
  let pausedAt = active ? null : lastWall;
  const drift = {samples: 0, totalMs: 0, maxMs: 0};
  const background = {pauses: active ? 0 : 1, totalMs: 0};
  const gaps = {count: 0, totalMs: 0, maxMs: 0};
  const tasks = {count: 0, totalMs: 0, maxMs: 0};

  function pause() {
    if (!active) return;
    active = false;
    pausedAt = wallNow();
    background.pauses += 1;
  }

  function resume() {
    if (pausedAt !== null) background.totalMs += Math.max(0, wallNow() - pausedAt);
    pausedAt = null;
    active = true;
    foregroundSince = now();
    lastTick = foregroundSince;
    lastWall = wallNow();
  }

  function tick() {
    if (!active) return;
    const current = now();
    const wall = wallNow();
    const elapsed = current - lastTick;
    const wallElapsed = wall - lastWall;
    lastTick = current;
    lastWall = wall;
    if (elapsed > maxGap || wallElapsed > maxGap || elapsed < 0) {
      const gap = Math.max(0, elapsed, wallElapsed);
      gaps.count += 1;
      gaps.totalMs += gap;
      gaps.maxMs = Math.max(gaps.maxMs, gap);
      return;
    }
    const delay = Math.max(0, elapsed - interval);
    drift.samples += 1;
    drift.totalMs += delay;
    drift.maxMs = Math.max(drift.maxMs, delay);
  }

  function longTask(entry) {
    // 恢复后收到的 buffered 记录也必须来自本次前台时段。
    if (!active || entry.startTime < foregroundSince) return;
    tasks.count += 1;
    tasks.totalMs += entry.duration;
    tasks.maxMs = Math.max(tasks.maxMs, entry.duration);
  }

  function snapshot() {
    return {
      eventLoopDrift: {
        samples: drift.samples,
        averageMs: drift.samples ? drift.totalMs / drift.samples : 0,
        maxMs: drift.maxMs,
      },
      background: {...background, totalMs: background.totalMs + (pausedAt === null ? 0 : Math.max(0, wallNow() - pausedAt))},
      samplingGaps: {...gaps},
      longTasks: {...tasks},
    };
  }

  return {pause, resume, tick, longTask, snapshot};
}
