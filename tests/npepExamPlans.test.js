import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer, File} from 'node:buffer';
import {planBlocked, planCanStart, planPlayback, readExamPlan} from '../src/utils/npepExamPlans.js';
const time = Date.parse('2026-09-27T00:00:00Z');
const fixture = () => ({online: true, receivedAt: new Date(time).toISOString(), status: {enabled: true, available: true,
  preparedId: 'prep', player: {known: true, sessions: [], lastSession: null}}});
const op = () => ({state: 'PREPARED', summary: {preparationId: 'prep'}, expiresAt: new Date(time + 300000).toISOString(), sessionId: 'p'});
test('exam plans require fresh consent and same preparation, not an old modal summary', () => {
  const v = fixture(), p = op(); assert.equal(planBlocked(v, time), ''); assert.equal(planCanStart(v, p, time), true);
  assert.equal(planCanStart(v, p, time + 45000), false);
  v.status.preparedId = 'new'; assert.equal(planCanStart(v, p, time), false);
  v.status.preparedId = 'prep'; v.status.player.sessions.push({id: 'other', state: 'ready'}); assert.equal(planCanStart(v, p, time), false);
  v.status.enabled = false; assert.match(planBlocked(v, time), /允许/);
});
test('accepted startup is not ready; unrelated sessions never masquerade as this plan', () => {
  const v = fixture(), p = {...op(), state: 'STARTED'};
  assert.match(planPlayback(v, p, time), /未找到/);
  v.status.player.sessions = [{id: 'other', state: 'ready'}]; assert.match(planPlayback(v, p, time), /未找到/);
  v.status.player.sessions = [{id: 'p', state: 'opening'}]; assert.match(planPlayback(v, p, time), /打开/);
  v.status.player.sessions = []; v.status.player.lastSession = {id: 'p', state: 'failed'};
  assert.equal(planPlayback(v, p, time), '放映失败'); assert.match(planPlayback(v, p, time + 45000), /未知/);
});
test('browser file path validates UTF8 bytes and size without rewriting the original plan', async () => {
  const file = new File(['\ufeff{"examName":"期中"}'], '期中.json');
  const got = await readExamPlan(file); assert.equal(got.dataBase64, Buffer.from(await file.arrayBuffer()).toString('base64'));
  await assert.rejects(readExamPlan(new File(['[]'], 'x.json')));
  await assert.rejects(readExamPlan(new File([new Uint8Array([255])], 'x.json')));
  await assert.rejects(readExamPlan(new File(['x'.repeat(24577)], 'x.json')));
});
