import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {nextTick} from 'vue';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

test('a screen token replacement invalidates unconfirmed handwriting before binding metadata refreshes', async () => {
  const store = h.newStore({screen: true});
  const {state} = await h.openComposer();
  Object.assign(state.form, {subjectId: 'math', targetWorkspaceId: 'class-a', content: '原正文'});
  await nextTick();
  const target = state.textTargets.content, snapshot = target.capture();
  h.api.saveClassroomScreenToken('replacement-token');
  assert.throws(() => target.apply(snapshot, '旧窗口结果'), /变化/);
  assert.equal(state.form.content, '原正文');
  await state.save();
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 0);
  assert.deepEqual(h.queue.loadScreenPublicationQueue(store.screenSession.binding.id), []);
  assert.equal(h.loadDraft('screen-a', 'new').content, '原正文');
});

test('another tab changing and restoring the screen token cannot reactivate an old handwriting selection', async () => {
  h.newStore({screen: true});
  const {state} = await h.openComposer();
  state.form.content = '原正文'; await nextTick();
  const target = state.textTargets.content, snapshot = target.capture(), token = h.api.getClassroomScreenToken();
  for (const value of ['other-tab-token', token]) {
    h.api.saveClassroomScreenToken(value);
    window.dispatchEvent(Object.assign(new globalThis.Event('storage'), {key: 'classworks-v2-screen-token'}));
  }
  assert.throws(() => target.apply(snapshot, '不能复活的旧结果'), /变化|不可录入/);
  assert.equal(state.form.content, '原正文');
});

for (const change of ['binding', 'credential', 'token']) test(`confirmed handwriting cannot enter a replacement ${change} queue after a delayed save failure`, async () => {
  const store = h.newStore({screen: true});
  const {state, events} = await h.openComposer();
  Object.assign(state.form, {subjectId: 'math', targetWorkspaceId: 'class-a'});
  await nextTick();
  state.textTargets.content.apply(state.textTargets.content.capture(), '原班确认后的第10—20页');
  await nextTick();
  const hold = deferred();
  h.routes.set('POST /api/v2/classroom-screens/publications', async (_req, reply) => {
    await hold.promise; reply({message: 'lost upstream response'}, 503);
  });
  const saving = state.save();
  await eventually(() => assert.ok(h.requests.some(r => r.method === 'POST')));
  if (change === 'binding') store.screenSession = {...store.screenSession, binding: {...store.screenSession.binding, id: 'screen-b'}};
  if (change === 'credential') store.screenSession.binding.credentialVersion = 2;
  if (change === 'token') h.api.saveClassroomScreenToken('replacement-token');
  hold.resolve(); await saving;
  assert.deepEqual(h.queue.loadScreenPublicationQueue('screen-b'), []);
  assert.deepEqual(h.queue.loadScreenPublicationQueue('screen-a'), []);
  assert.deepEqual(events, []);
  assert.equal(state.form.content, '原班确认后的第10—20页');
  assert.equal(h.loadDraft('screen-a', 'new').content, state.form.content);
  assert.match(state.localError.value, /绑定.*变化/);
});

test('an old successful save cannot close the composer or clear its confirmed draft after rebinding', async () => {
  const store = h.newStore({screen: true}), hold = deferred();
  const {state, events} = await h.openComposer();
  Object.assign(state.form, {subjectId: 'math', targetWorkspaceId: 'class-a'});
  await nextTick();
  state.textTargets.content.apply(state.textTargets.content.capture(), '原班已确认文字');
  await nextTick();
  h.routes.set('POST /api/v2/classroom-screens/publications', async (_req, reply) => {
    await hold.promise; reply({id: 'old-success', revision: 1});
  });
  const saving = state.save();
  await eventually(() => assert.ok(h.requests.some(r => r.method === 'POST')));
  store.screenSession = {...store.screenSession, binding: {...store.screenSession.binding, id: 'screen-b'}};
  hold.resolve(); await saving;
  assert.deepEqual(events, []);
  assert.equal(h.loadDraft('screen-a', 'new').content, '原班已确认文字');
  assert.equal(h.requests.filter(r => r.path.includes('/feed')).length, 0);
});

for (const change of ['token', 'credential']) for (const manual of [false, true]) test(`a changed ${change} during ${manual ? 'manual' : 'automatic'} replay retains the original queue`, async () => {
  const store = h.newStore({screen: true}), hold = deferred();
  const token = h.api.getClassroomScreenToken(), version = store.screenSession.binding.credentialVersion;
  store.screenNetworkOnline = false;
  await store.saveScreenPublication({content: '第一项确认文字'});
  await store.saveScreenPublication({content: '第二项确认文字'});
  store.screenNetworkOnline = true;
  h.routes.set('POST /api/v2/classroom-screens/publications', async (_req, reply) => {
    await hold.promise; reply({id: 'old-replay-success', revision: 1});
  });
  const pending = manual ? store.retryScreenQueuedPublication(store.screenPendingUploads[0].id) : store.flushScreenPublicationQueue();
  await eventually(() => assert.ok(h.requests.some(r => r.method === 'POST')));
  // Bootstrap may still be waiting: the token changes before binding data does.
  if (change === 'token') h.api.saveClassroomScreenToken('replacement-screen-token');
  else store.screenSession.binding.credentialVersion = 2;
  hold.resolve(); await pending;
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  assert.equal(h.queue.loadScreenPublicationQueue('screen-a').length, 2);
  assert.equal(store.screenSyncing, false);
  assert.equal(h.requests.filter(r => r.path.includes('/feed')).length, 0);
  h.api.saveClassroomScreenToken(token); store.screenSession.binding.credentialVersion = version;
  await store.flushScreenPublicationQueue();
  assert.deepEqual(h.queue.loadScreenPublicationQueue('screen-a'), []);
  assert.equal(store.screenSyncing, false);
  assert.equal(store.screenError, '');
});
