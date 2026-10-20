import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {nextTick} from 'vue';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

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
