import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  browserScheduledDisplayCandidate, nativeDisplayPhase, nativeScheduledDisplayCandidate,
  schoolCalendarMilliseconds, schoolRemainingSeconds, scheduledDisplayStorageKey,
} from '../src/utils/scheduledNoiseDisplay.js';

const window = {start: '2026-10-01T23:50:00.000', end: '2026-10-02T00:10:00.000'};
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
