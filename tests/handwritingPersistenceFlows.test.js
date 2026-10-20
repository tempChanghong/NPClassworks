import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {nextTick} from 'vue';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

for (const restore of [false, true]) for (const operation of ['save', 'merge', 'copy', 'reload']) {
  test(`teacher ${operation}: a late reply after another-window login${restore ? ' and return' : ''} preserves confirmed text`, async () => {
    const store = h.newStore(), hold = deferred();
    const original = {id: 'teacher-source', revision: 1, type: 'ASSIGNMENT', status: 'PUBLISHED',
      subjectId: 'math', priority: 'NORMAL', content: '原教师正文', publishAt: new Date().toISOString(),
      targets: [{workspaceId: 'class-a'}]};
    h.api.saveAccountTokens({accessToken: 'teacher-a', refreshToken: 'refresh-a'});
    store.account = {id: 'teacher-a'};
    store.eligibleTeacherWorkspaces = () => [h.workspace];
    store.rememberTeacherTargetCombination = () => true;
    const {state: s, events} = await h.openComponent('/src/components/v2/PublicationComposer.vue', {editingPublication: original});
    await nextTick();
    s.textTargets.content.apply(s.textTargets.content.capture(), '已确认且需要保留的正文');
    await nextTick();
    const confirmed = s.form.content;
    if (operation !== 'save') {
      s.conflict.value = {latestRevision: 2, latestPublication: {...original, revision: 2}};
      s.conflictInput.value = {content: confirmed, subjectId: 'math', targetWorkspaceIds: ['class-a'], status: 'PUBLISHED'};
      s.conflictFormSnapshot.value = JSON.stringify(s.form);
    }
    const path = operation === 'reload' ? 'GET /api/v2/publications/teacher-source'
      : operation === 'copy' ? 'POST /api/v2/publications' : 'PATCH /api/v2/publications/teacher-source';
    h.routes.set(path, async (_req, reply) => {
      await hold.promise; reply({...original, revision: 3, content: '迟到的服务器正文'});
    });
    const pending = operation === 'save' ? s.submit('DRAFT') : operation === 'merge' ? s.applyLocalOnLatest()
      : operation === 'copy' ? s.saveConflictCopy() : s.reloadLatest();
    if (operation === 'merge' || operation === 'reload') h.dialogs.settleActionDialog(true);
    try {
      await eventually(() => assert.ok(h.requests.some(req => `${req.method} ${req.path}` === path)));
      const session = store.teacherSessionVersion;
      for (const suffix of restore ? ['b', 'a'] : ['b']) {
        h.storage.setItem('classworks-v2-access-token', `teacher-${suffix}`);
        h.storage.setItem('classworks-v2-refresh-token', `refresh-${suffix}`);
        window.dispatchEvent(Object.assign(new globalThis.Event('storage'), {key: 'classworks-v2-refresh-token'}));
      }
      assert.equal(store.teacherSessionVersion, session, 'cross-tab storage changes precede local bootstrap');
      hold.resolve(); await pending;
      assert.equal(s.form.content, confirmed);
      assert.deepEqual(events, []);
      assert.equal(s.requestBusy.value, false);
    } finally { hold.resolve(); await pending; }
  });
}

for (const operation of ['save', 'reload']) test(`teacher ${operation}: access-token renewal still accepts the current reply`, async () => {
  const store = h.newStore(), hold = deferred();
  const original = {id: 'renewal-source', revision: 1, type: 'ASSIGNMENT', status: 'PUBLISHED',
    subjectId: 'math', priority: 'NORMAL', content: '续期前正文', publishAt: new Date().toISOString(),
    targets: [{workspaceId: 'class-a'}]};
  h.api.saveAccountTokens({accessToken: 'teacher-a', refreshToken: 'refresh-a'});
  store.account = {id: 'teacher-a'};
  store.eligibleTeacherWorkspaces = () => [h.workspace];
  store.rememberTeacherTargetCombination = () => true;
  const {state: s, events} = await h.openComponent('/src/components/v2/PublicationComposer.vue', {editingPublication: original});
  await nextTick();
  s.textTargets.content.apply(s.textTargets.content.capture(), '续期期间确认的正文'); await nextTick();
  if (operation === 'reload') s.conflict.value = {latestRevision: 2};
  const path = `${operation === 'save' ? 'PATCH' : 'GET'} /api/v2/publications/renewal-source`;
  h.routes.set(path, async (_req, reply) => { await hold.promise; reply({...original, revision: 2}); });
  const pending = operation === 'save' ? s.submit('DRAFT') : s.reloadLatest();
  if (operation === 'reload') h.dialogs.settleActionDialog(true);
  try {
    await eventually(() => assert.ok(h.requests.some(req => `${req.method} ${req.path}` === path)));
    h.storage.setItem('classworks-v2-access-token', 'renewed-access-token');
    window.dispatchEvent(Object.assign(new globalThis.Event('storage'), {key: 'classworks-v2-access-token'}));
    hold.resolve(); await pending;
    assert.equal(events.length, 1);
    assert.equal(events[0][0], operation === 'save' ? 'published' : 'reload-latest');
    assert.equal(events[0][1].revision, 2);
    assert.equal(s.requestBusy.value, false);
  } finally { hold.resolve(); await pending; }
});

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

test('an unmounted save completion cannot delete the replacement editor confirmed draft', async () => {
  h.newStore({screen: true});
  const first = await h.openComposer(), hold = deferred();
  Object.assign(first.state.form, {subjectId: 'math', targetWorkspaceId: 'class-a'});
  await nextTick();
  first.state.textTargets.content.apply(first.state.textTargets.content.capture(), '第一份已确认文字');
  await nextTick();
  h.routes.set('POST /api/v2/classroom-screens/publications', async (_req, reply) => {
    await hold.promise; reply({id: 'saved-before-navigation', revision: 1});
  });
  const saving = first.state.save();
  try {
    await eventually(() => assert.ok(h.requests.some(r => r.method === 'POST')));
    first.unmount();
    const replacement = await h.openComposer();
    replacement.state.form.content = '';
    await nextTick();
    replacement.state.textTargets.content.apply(replacement.state.textTargets.content.capture(), '新窗口已确认但未保存的文字');
    await nextTick();
    hold.resolve(); await saving;
    assert.equal(h.loadDraft('screen-a', 'new')?.content, '新窗口已确认但未保存的文字');
    assert.deepEqual(first.events, []);
    assert.equal(replacement.state.form.content, '新窗口已确认但未保存的文字');
  } finally { hold.resolve(); await saving; }
});

for (const method of ['saveConflictCopy', 'applyLocalOnLatest']) test(`an unmounted ${method} cannot clear a reopened conflict draft`, async () => {
  h.newStore({screen: true});
  const original = {id: 'source', revision: 1, subjectId: 'math', content: '原正文',
    targets: [{workspaceId: 'class-a'}], publishAt: new Date().toISOString()};
  const first = await h.openComposer(original), hold = deferred();
  first.state.form.content = '冲突后已确认的原输入'; await nextTick();
  first.state.conflict.value = {latestRevision: 2, latestPublication: {...original, revision: 2}};
  const path = method === 'saveConflictCopy' ? 'POST /api/v2/classroom-screens/publications' : 'PATCH /api/v2/classroom-screens/publications/source';
  h.routes.set(path, async (_req, reply) => { await hold.promise; reply({...original, revision: 3}); });
  const saving = first.state[method]();
  if (method === 'applyLocalOnLatest') h.dialogs.settleActionDialog(true);
  try {
    await eventually(() => assert.ok(h.requests.some(r => `${r.method} ${r.path}` === path)));
    first.unmount();
    const replacement = await h.openComposer(original);
    replacement.state.form.content = '重新打开后确认的后续输入'; await nextTick();
    hold.resolve(); await saving;
    assert.equal(h.loadDraft('screen-a', original.id)?.content, '重新打开后确认的后续输入');
    assert.deepEqual(first.events, []);
  } finally { hold.resolve(); await saving; }
});

test('a delayed conflict reload cannot replace confirmed text after credentials change', async () => {
  h.newStore({screen: true});
  const original = {id: 'source', revision: 1, subjectId: 'math', content: '原正文', targets: [{workspaceId: 'class-a'}]};
  const {state} = await h.openComposer(original), hold = deferred();
  state.textTargets.content.apply(state.textTargets.content.capture(), '已确认且仍需保留的手写文字');
  await nextTick();
  const confirmed = state.form.content;
  state.conflict.value = {latestRevision: 2};
  h.routes.set('GET /api/v2/classroom-screens/publications/source', async (_req, reply) => {
    await hold.promise; reply({...original, content: '旧范围返回的服务器正文', revision: 2});
  });
  const loading = state.reloadLatest(); h.dialogs.settleActionDialog(true);
  try {
    await eventually(() => assert.ok(h.requests.some(r => r.method === 'GET' && r.path.endsWith('/source'))));
    h.api.saveClassroomScreenToken('replacement-screen-token');
    hold.resolve(); await loading;
    assert.equal(state.form.content, confirmed);
    assert.equal(h.loadDraft('screen-a', original.id)?.content, confirmed);
    assert.match(state.localError.value, /绑定.*变化/);
  } finally { hold.resolve(); await loading; }
});

test('closing a failed draft after rebinding persists its final text only under its original class', async () => {
  const store = h.newStore({screen: true});
  const {state, events} = await h.openComposer();
  state.form.content = '原班已落盘正文'; await nextTick();
  const write = h.storage.setItem;
  try {
    h.storage.setItem = (key, value) => {
      if (key.startsWith('classworks-v2-screen-homework-draft:')) throw new Error('QuotaExceededError');
      write(key, value);
    };
    state.form.content = '原班后来确认但暂未落盘的正文'; await nextTick();
    assert.equal(state.draftSaveFailed.value, true);
  } finally { h.storage.setItem = write; }
  const tab = sessionStorage.getItem('classworks-v2-draft-tab');
  const key = `classworks-v2-screen-homework-draft:screen-b:new:tab:${tab}`;
  const second = JSON.stringify({content: '另一个班级自己的草稿', updatedAt: Date.now()});
  h.storage.setItem(key, second);
  store.screenSession = {...store.screenSession, binding: {id: 'screen-b'}};
  await nextTick(); state.requestVisibility(false); await nextTick();
  assert.equal(h.storage.getItem(key), second);
  assert.equal(h.loadDraft('screen-a', 'new').content, '原班后来确认但暂未落盘的正文');
  assert.deepEqual(events, [['update:modelValue', false]]);
  assert.equal(h.requests.length, 0);
});

for (const change of ['remove', 'review']) test(`automatic replay skips a queued item another window marks ${change} while an earlier upload waits`, async () => {
  const store = h.newStore({screen: true}), hold = deferred();
  store.screenNetworkOnline = false;
  await store.saveScreenPublication({content: '先提交的确认文字'});
  await store.saveScreenPublication({content: '后来需要撤销或重新核对的文字'});
  const [first, second] = store.screenPendingUploads;
  const sent = [];
  h.routes.set('POST /api/v2/classroom-screens/publications', async (req, reply) => {
    sent.push(req.body.clientRequestId);
    if (sent.length === 1) await hold.promise;
    reply({id: req.body.clientRequestId, revision: 1});
  });
  store.screenNetworkOnline = true;
  const replay = store.flushScreenPublicationQueue();
  try {
    await eventually(() => assert.equal(sent.length, 1));
    await h.queue.mutateScreenPublicationQueue('screen-a', () => change === 'remove'
      ? h.queue.removeScreenPublicationQueueItem('screen-a', second.id)
      : h.queue.updateScreenPublicationQueueItem('screen-a', second.id, {status: 'needs_review'}));
    hold.resolve(); await replay;
    assert.deepEqual(sent, [first.input.clientRequestId]);
    const remaining = h.queue.loadScreenPublicationQueue('screen-a');
    assert.equal(remaining.length, change === 'remove' ? 0 : 1);
    if (change === 'review') assert.equal(remaining[0].status, 'needs_review');
    assert.equal(store.screenSyncing, false);
  } finally { hold.resolve(); await replay; }
});

test('an unreadable queue between uploads cannot authorize the remaining batch from memory', async () => {
  const store = h.newStore({screen: true});
  store.screenNetworkOnline = false;
  await store.saveScreenPublication({content: '第一项已确认文字'});
  await store.saveScreenPublication({content: '第二项仍需读取队列确认'});
  const [first, second] = store.screenPendingUploads;
  const key = 'classworks-v2-screen-publication-queue:screen-a';
  const read = h.storage.getItem, write = h.storage.setItem, sent = [];
  let blocked = false;
  h.routes.set('POST /api/v2/classroom-screens/publications', (req, reply) => {
    sent.push(req.body.clientRequestId); reply({id: req.body.clientRequestId, revision: 1});
  });
  h.storage.setItem = (name, value) => {
    write(name, value);
    if (name === key && JSON.parse(value).length === 1) blocked = true;
  };
  h.storage.getItem = name => {
    if (name === key && blocked) throw new Error('Storage unavailable');
    return read(name);
  };
  store.screenNetworkOnline = true;
  try {
    await store.flushScreenPublicationQueue();
    assert.deepEqual(sent, [first.input.clientRequestId]);
    assert.equal(store.screenSyncing, false);
    assert.ok(store.screenQueueReadError);
    assert.equal(JSON.parse(read(key))[0].id, second.id);
  } finally { h.storage.getItem = read; h.storage.setItem = write; }
  await store.flushScreenPublicationQueue();
  assert.deepEqual(sent, [first.input.clientRequestId, second.input.clientRequestId]);
  assert.deepEqual(h.queue.loadScreenPublicationQueue('screen-a'), []);
  assert.equal(store.screenQueueReadError, '');
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
