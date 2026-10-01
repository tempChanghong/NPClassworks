import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledReportSource, schoolCalendarText} from '../src/utils/noiseReportSources.js';

const version = 'a'.repeat(64);
const window = {start: '2026-10-01T23:30:00.000', end: '2026-10-02T00:30:00.000'};
const source = {sessionId: 'scheduled-session', version, window};

test('historical source matches the exact session, including a cross-midnight window', () => {
  assert.deepEqual(scheduledReportSource(source.sessionId, [source]), {version, window});
  assert.equal(scheduledReportSource('different-session', [source]), null);
  // A matching interval alone does not establish who started a session.
  assert.equal(scheduledReportSource('manual-or-unobserved', [{...source, window: {...window}}]), null);
});

test('missing, old or malformed records leave the source unconfirmed', () => {
  for (const records of [null, undefined, {}, [], [null], [{sessionId: source.sessionId}], [{...source, version: null}]])
    assert.equal(scheduledReportSource(source.sessionId, records), null);
  assert.equal(scheduledReportSource(null, [source]), null);
  assert.equal(scheduledReportSource('', [source]), null);
  assert.equal(scheduledReportSource(source.sessionId, [{...source, version: 'not-a-version'}]), null);
});

test('source metadata arriving after a report resolves it without changing report statistics', () => {
  const report = {sessionId: source.sessionId, summary: {energyMeanDbfs: -57, coverage: 0.98}};
  const original = globalThis.structuredClone(report);
  assert.equal(scheduledReportSource(report.sessionId, []), null);
  assert.deepEqual(scheduledReportSource(report.sessionId, [source]), {version, window});
  assert.deepEqual(report, original);
});

test('identical repeats are accepted; conflicting versions and windows are never arbitrarily chosen', () => {
  assert.deepEqual(scheduledReportSource(source.sessionId, [source, globalThis.structuredClone(source)]), {version, window});
  for (const conflicting of [{...source, version: 'b'.repeat(64)}, {...source, window: {...window, end: '2026-10-02T00:31:00.000'}}]) {
    assert.equal(scheduledReportSource(source.sessionId, [source, conflicting]), null);
    assert.equal(scheduledReportSource(source.sessionId, [conflicting, source]), null);
  }
});

test('invalid school calendars, zoned values and reversed windows cannot claim scheduled provenance', () => {
  for (const start of ['2026-02-30T23:30:00.000', '2026-10-01T23:30:00.000Z', '2026-10-01T23:30:00+08:00', '1999-10-01T23:30:00.000', '2026-10-01T24:00:00.000', 1])
    assert.equal(scheduledReportSource(source.sessionId, [{...source, window: {...window, start}}]), null);
  assert.equal(scheduledReportSource(source.sessionId, [{...source, window: {start: window.end, end: window.start}}]), null);
  assert.equal(scheduledReportSource(source.sessionId, [{...source, window: {start: window.start, end: window.start}}]), null);
  assert.equal(schoolCalendarText('2024-02-29T23:59:59.999'), '2024-02-29 23:59:59');
  assert.equal(schoolCalendarText('2100-02-29T12:00:00.000'), '学校时间未确认');
});

test('school calendar formatting is independent of the browser/system timezone', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      assert.equal(schoolCalendarText(window.start), '2026-10-01 23:30:00');
      assert.equal(schoolCalendarText(window.end), '2026-10-02 00:30:00');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
