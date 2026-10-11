import test from 'node:test';
import assert from 'node:assert/strict';
import {readDeviceOverview, overviewIssueName} from '../src/utils/npepDeviceOverview.js';

const data = {asOf: '2026-10-04T04:00:00Z', summary: {total: 5, active: 4, online: 2, offline: 1, unreported: 1, attention: 2, inactive: 1},
  matchedTotal: 2, items: [{deviceId: 'device', issues: ['OFFLINE']}], nextCursor: null};
test('overview accepts paginated school totals and safely names observed issues', () => {
  assert.equal(readDeviceOverview(data), data);
  assert.match(overviewIssueName('EXAMAWARE_NOT_CONNECTED'), /考试模式/);
  assert.equal(overviewIssueName('untrusted text'), '状态需核对');
});
test('invalid overview cannot silently replace a valid school snapshot', () => {
  for (const change of [{asOf: 'bad'}, {summary: {...data.summary, online: 99}}, {summary: {...data.summary, active: -1}},
    {summary: {...data.summary, total: 2}}, {matchedTotal: 99}, {items: [{deviceId: 'device'}]}, {nextCursor: 12}]) {
    assert.throws(() => readDeviceOverview({...data, ...change}), /Invalid device overview/);
  }
});
