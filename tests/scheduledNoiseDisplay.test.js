import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  browserScheduledDisplayCandidate, nativeDisplayPhase, nativeScheduledDisplayCandidate,
  schoolCalendarMilliseconds, schoolRemainingSeconds, scheduledDisplayStorageKey,
  scheduledReturnStorageKey, activeScheduledReturn, hydrateScheduledReturn,
  scheduledReturnRemainingMs, serverReturnRemainingMs,
} from '../src/utils/scheduledNoiseDisplay.js';
import {classifyScheduledNoisePresence} from '../src/utils/scheduledNoisePresence.js';

const window = {start: '2026-10-01T23:50:00.000', end: '2026-10-02T00:10:00.000'};

test('presence reports actual display, focus and higher-priority overlays', () => {
  const base = {candidate: {provider: 'native'}, returning: false, visible: true,
    focused: true, blocked: false, overlayActive: false, displayed: true};
  assert.equal(classifyScheduledNoisePresence(base), 'DISPLAY_VISIBLE');
  assert.equal(classifyScheduledNoisePresence({...base, returning: true}), 'RETURNING');
  assert.equal(classifyScheduledNoisePresence({...base, visible: false}), 'HIDDEN');
  assert.equal(classifyScheduledNoisePresence({...base, focused: false}), 'HIDDEN');
  assert.equal(classifyScheduledNoisePresence({...base, blocked: true}), 'BLOCKED');
  assert.equal(classifyScheduledNoisePresence({...base, overlayActive: true, displayed: false}), 'BLOCKED');
  assert.equal(classifyScheduledNoisePresence({...base, displayed: false}), 'HIDDEN');
  assert.equal(classifyScheduledNoisePresence({...base, candidate: {provider: 'browser'}}), null);
});
function snapshots({state = 'Active', reason = 'WINDOW_ACTIVE', sessionId = 'session-1',
  scheduleSessionId = sessionId, applied = true} = {}) {
  return {
    noise: {provider: 'native', online: true, status: {state, sessionId, quality: 'Good', currentDbfs: -57}},
    schedule: {supported: true, online: true, applied, status: {owner: 'Schedule', reason,
      sessionId: scheduleSessionId, clockReady: true, dateNeedsReview: false,
      schoolNow: '2026-10-01T23:51:00.000', window}},
  };
}

test('enters only with a fresh, matching scheduled capture, regardless of applied flag', () => {
  const {noise, schedule} = snapshots({applied: false});
  const candidate = nativeScheduledDisplayCandidate(noise, schedule);
  assert.deepEqual(candidate, {provider: 'native', sessionId: 'session-1', window,
    windowKey: JSON.stringify([window.start, window.end])});
  assert.equal(nativeScheduledDisplayCandidate(noise, {...schedule, online: false}), null);
  assert.equal(nativeScheduledDisplayCandidate({...noise, online: false}, schedule), null);
  assert.equal(nativeScheduledDisplayCandidate({...noise, status: {...noise.status, state: 'Starting'}}, schedule), null);
  assert.equal(nativeScheduledDisplayCandidate(noise, {...schedule, status: {...schedule.status, sessionId: 'other'}}), null);
  assert.equal(nativeScheduledDisplayCandidate(noise, {...schedule, status: {...schedule.status, clockReady: false}}), null);
  assert.equal(nativeScheduledDisplayCandidate(noise, {...schedule, status: {...schedule.status, dateNeedsReview: true}}), null);
  assert.equal(nativeScheduledDisplayCandidate(noise, {...schedule, status: {...schedule.status, owner: 'Manual'}}), null);
});

test('keeps unknown states distinct from a verified end or exam pause', () => {
  assert.equal(nativeDisplayPhase(null, null, null), 'unknown');
  assert.equal(nativeDisplayPhase({provider: 'native', online: true}, {online: true}, null), 'unknown');
  const {noise, schedule} = snapshots();
  const context = nativeScheduledDisplayCandidate(noise, schedule);
  assert.equal(nativeDisplayPhase(noise, schedule, context), 'active');
  assert.equal(nativeDisplayPhase({...noise, online: false}, schedule, context), 'unknown');
  assert.equal(nativeDisplayPhase({...noise, status: {...noise.status, state: 'Stopped'}}, schedule, context), 'unknown');
  assert.equal(nativeDisplayPhase({...noise, status: {...noise.status, state: 'Stopped'}},
    {...schedule, status: {...schedule.status, reason: 'WINDOW_SKIPPED'}}, context), 'ended');
  assert.equal(nativeDisplayPhase({...noise, status: {...noise.status, state: 'Faulted'}},
    {...schedule, status: {...schedule.status, reason: 'WINDOW_FAILED'}}, context), 'unknown');
  assert.equal(nativeDisplayPhase({...noise, status: {...noise.status, state: 'Stopped'}},
    {...schedule, status: {...schedule.status, reason: 'WINDOW_FAILED'}}, context), 'unknown');
  const naturalSchedule = {...schedule, status: {...schedule.status, owner: 'None', reason: 'OUTSIDE_WINDOW',
    schoolNow: '2026-10-02T00:10:02.000', window: null, sessionId: null}};
  assert.equal(nativeDisplayPhase({...noise, status: {...noise.status, state: 'Stopped'}}, naturalSchedule, context), 'ended');
  assert.equal(nativeDisplayPhase({...noise, status: {...noise.status, state: 'Stopped', sessionId: 'other'}},
    naturalSchedule, context), 'unknown');
  assert.equal(nativeDisplayPhase({...noise, status: {...noise.status, state: 'Stopped'}},
    {...naturalSchedule, status: {...naturalSchedule.status, schoolNow: '2026-10-02T00:09:59.000'}}, context), 'unknown');
  assert.equal(nativeDisplayPhase(noise, {...schedule, status: {...schedule.status, reason: 'EXAM_PAUSED'}}, context), 'exam');
});

test('school calendar arithmetic crosses midnight without a viewer timezone conversion', () => {
  assert.equal(schoolRemainingSeconds('2026-10-01T23:59:30.000', window.end), 630);
  assert.equal(schoolRemainingSeconds('2026-10-01T23:59:30.000', window.end, 1500), 629);
  assert.equal(schoolCalendarMilliseconds('2026-10-01T23:59:30.500')
    - schoolCalendarMilliseconds('2026-10-01T23:59:30.000'), 500);
  assert.equal(schoolRemainingSeconds('2026-10-02T00:11:00.000', window.end), 0);
  assert.equal(schoolCalendarMilliseconds('2026-02-30T19:00:00.000'), null);
  assert.equal(schoolCalendarMilliseconds('2026-10-01T19:00:00Z'), null);
});

test('browser legacy provider needs a running scheduled session, and binding scopes dismissal', () => {
  const state = {bindingId: 'screen-1', scheduledActive: true, status: 'active', scheduledEndTime: '20:00'};
  assert.deepEqual(browserScheduledDisplayCandidate('browser', state, 'screen-1'),
    {provider: 'browser', windowKey: '20:00'});
  assert.equal(browserScheduledDisplayCandidate('native', state, 'screen-1'), null);
  assert.equal(browserScheduledDisplayCandidate('browser', {...state, status: 'initializing'}, 'screen-1'), null);
  assert.equal(browserScheduledDisplayCandidate('browser', {...state, scheduledActive: false}, 'screen-1'), null);
  assert.notEqual(scheduledDisplayStorageKey('https://a', 'screen-1'), scheduledDisplayStorageKey('https://a', 'screen-2'));
  assert.notEqual(scheduledReturnStorageKey('https://a', 'screen-1'), scheduledReturnStorageKey('https://a', 'screen-2'));
});

test('return lease remains scoped to one schedule window and expires without extension', () => {
  const key = JSON.stringify([window.start, window.end]);
  const lease = {windowKey: key, expiresAt: 10000};
  assert.equal(activeScheduledReturn(lease, key, 5000), lease);
  assert.equal(activeScheduledReturn(lease, key, 10000), null);
  assert.equal(activeScheduledReturn(lease, 'other', 5000), null);
});

test('return countdown uses a monotonic clock and rejects backward wall-clock reloads', () => {
  const lease = {windowKey: 'window-a', requestId: 'request-a', startedAt: 1000,
    expiresAt: 601000, savedAt: 1000, remainingMs: 600000};
  const active = hydrateScheduledReturn(lease, 2000, 100);
  assert.equal(scheduledReturnRemainingMs(active, 6100), 593000);
  assert.equal(scheduledReturnRemainingMs(active, 6100), 593000);
  assert.equal(hydrateScheduledReturn(lease, -2000, 100), null);
  assert.equal(hydrateScheduledReturn(lease, 700000, 100), null);
});

test('server countdown subtracts request travel and cannot grow from rounded seconds', () => {
  const active = {expiresAt: '2026-10-04T19:10:00.000Z', remainingSeconds: 600};
  assert.equal(serverReturnRemainingMs(active, '2026-10-04T19:00:00.000Z', 120), 599880);
  assert.equal(serverReturnRemainingMs(active, '2026-10-04T19:00:00.500Z', 120), 599380);
});

test('optional synthetic desktop 0.6/0.7 snapshots satisfy the same entry contract', {skip: !process.env.NPEP_NOISE_CONTRACTS_DIR}, () => {
  for (const name of ['starting', 'active', 'stopped', 'resumed', 'manual', 'naturally-ended', 'failed']) {
    const fixture = JSON.parse(readFileSync(join(process.env.NPEP_NOISE_CONTRACTS_DIR, `${name}.json`), 'utf8'));
    assert.equal(fixture.source, 'synthetic-desktop-services');
    const noise = {provider: 'native', online: true, status: fixture.noiseStatus};
    const schedule = {supported: true, online: true, applied: true,
      policy: {source: fixture.scheduleStatus.source}, status: fixture.scheduleStatus};
    assert.equal(Boolean(nativeScheduledDisplayCandidate(noise, schedule)), fixture.expectedAutoEligible, name);
    if (fixture.previousScheduleStatus) {
      const before = nativeScheduledDisplayCandidate(
        {provider: 'native', online: true, status: {...fixture.noiseStatus, state: 'Active'}},
        {...schedule, status: fixture.previousScheduleStatus});
      assert.equal(nativeDisplayPhase(noise, schedule, before), fixture.expectedPhase, name);
    }
  }
});
