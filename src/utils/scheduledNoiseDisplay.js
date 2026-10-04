// Both screen endpoints must describe the same running scheduled session.
// The 0.6 and 0.7 requests are sequential, so a policy alone is never evidence of capture.
export function nativeScheduledDisplayCandidate(noiseStatus, scheduleStatus) {
  const execution = noiseStatus?.status;
  const schedule = scheduleStatus?.status;
  const window = schedule?.window;
  if (noiseStatus?.provider !== 'native' || noiseStatus.online !== true || execution?.state !== 'Active'
    || scheduleStatus?.supported !== true || scheduleStatus.online !== true
    || schedule?.owner !== 'Schedule' || schedule.reason !== 'WINDOW_ACTIVE'
    || schedule.clockReady !== true || schedule.dateNeedsReview !== false
    || !window?.start || !window?.end || schoolCalendarMilliseconds(window.start) === null
    || schoolCalendarMilliseconds(window.end) === null || !schedule.sessionId
    || schedule.sessionId !== execution.sessionId) return null;
  return {provider: 'native', sessionId: schedule.sessionId,
    window: {start: window.start, end: window.end}, windowKey: JSON.stringify([window.start, window.end])};
}

export function browserScheduledDisplayCandidate(provider, monitoring, bindingId) {
  if (provider !== 'browser' || !bindingId || monitoring?.bindingId !== bindingId
    || monitoring.scheduledActive !== true || monitoring.status !== 'active') return null;
  return {provider: 'browser', windowKey: String(monitoring.scheduledEndTime || 'current')};
}

// School calendar fields have no timezone suffix. Use UTC only for arithmetic on the
// calendar components; never reinterpret them as an instant in the viewer's timezone.
export function schoolCalendarMilliseconds(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value || '');
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.slice(0, 7).map(Number);
  const fraction = Number((match[7] || '').padEnd(3, '0'));
  const milliseconds = Date.UTC(year, month - 1, day, hour, minute, second, fraction);
  const date = new Date(milliseconds);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute && date.getUTCSeconds() === second
    && date.getUTCMilliseconds() === fraction
    ? milliseconds : null;
}

export function schoolRemainingSeconds(schoolNow, end, elapsedMilliseconds = 0) {
  const now = schoolCalendarMilliseconds(schoolNow);
  const until = schoolCalendarMilliseconds(end);
  if (now === null || until === null || !Number.isFinite(elapsedMilliseconds)) return null;
  return Math.max(0, Math.ceil((until - now - Math.max(0, elapsedMilliseconds)) / 1000));
}

export function nativeDisplayPhase(noiseStatus, scheduleStatus, context) {
  if (nativeScheduledDisplayCandidate(noiseStatus, scheduleStatus)?.windowKey === context?.windowKey) return 'active';
  if (scheduleStatus?.online && scheduleStatus.status?.reason === 'EXAM_PAUSED') return 'exam';
  if (noiseStatus?.provider !== 'native' || !noiseStatus.online || !scheduleStatus?.online) return 'unknown';
  const execution = noiseStatus.status;
  const schedule = scheduleStatus.status;
  const sameWindow = JSON.stringify([schedule?.window?.start, schedule?.window?.end]) === context?.windowKey;
  // A completed window may disappear from 0.7. The stopped 0.6 session must
  // still be the one this display opened for, and the verified school clock
  // must have passed this window's end before OUTSIDE_WINDOW can close it.
  const naturalEnd = schedule?.reason === 'OUTSIDE_WINDOW' && !schedule?.window
    && schedule.clockReady === true && schedule.dateNeedsReview === false
    && schoolRemainingSeconds(schedule.schoolNow, context?.window?.end) === 0;
  if (execution?.sessionId === context?.sessionId
    && ['Stopped', 'Idle'].includes(execution?.state)
    && ((sameWindow && ['WINDOW_SKIPPED', 'OUTSIDE_WINDOW'].includes(schedule?.reason))
      || naturalEnd)) return 'ended';
  return 'unknown';
}

export function scheduledDisplayStorageKey(serverUrl, bindingId) {
  return `npep.noise.display.dismissed:${JSON.stringify([serverUrl, bindingId])}`;
}
