import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {nextTick} from 'vue';
import {createFlowHarness, deferred, eventually} from './helpers/flowHarness.js';

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

function login(store) {
  h.api.saveAccountTokens({accessToken: 'access-a', refreshToken: 'refresh-a'});
  store.account = {id: 'teacher-a'};
  store.teacherSubjects = [{id: 'math', name: '数学'}];
  store.eligibleTeacherWorkspaces = () => [h.workspace];
}
function replaceCredentials(change) {
  if (change === 'renewal') {
    h.storage.setItem('classworks-v2-access-token', 'renewed-access-a');
    window.dispatchEvent(Object.assign(new globalThis.Event('storage'), {key: 'classworks-v2-access-token'}));
    return;
  }
  for (const suffix of change === 'login-return' ? ['b', 'a'] : ['b']) {
    h.storage.setItem('classworks-v2-access-token', `access-${suffix}`);
    h.storage.setItem('classworks-v2-refresh-token', `refresh-${suffix}`);
    window.dispatchEvent(Object.assign(new globalThis.Event('storage'), {key: 'classworks-v2-refresh-token'}));
  }
}

for (const change of ['login', 'login-return', 'renewal']) test(`history preparation ignores a late source after ${change}, except ordinary renewal`, async () => {
  const store = h.newStore(); login(store);
  const source = {id: 'reuse-source', subjectId: 'math', type: 'ASSIGNMENT', status: 'PUBLISHED',
    content: '旧会话的历史正文', boardDate: '2020-01-01', publishAt: '2020-01-01T00:00:00Z'};
  store.teacherPublications = [source];
  const {state: s} = await h.openComponent('/src/components/v2/TeacherHomeworkReuse.vue', {});
  s.selected.value = [source.id];
  const hold = deferred();
  h.routes.set('GET /api/v2/publications/reuse-source', async (_req, reply) => { await hold.promise; reply(source); });
  const pending = s.prepare();
  try {
    await eventually(() => assert.ok(h.requests.some(req => req.path === '/api/v2/publications/reuse-source')));
    const session = store.teacherSessionVersion;
    replaceCredentials(change); await nextTick();
    assert.equal(store.teacherSessionVersion, session, 'other-tab credentials change before this workspace bootstraps');
    hold.resolve(); await pending;
    if (change === 'renewal') {
      assert.equal(s.queue.value.length, 1);
      assert.equal(s.queue.value[0].draft.content, source.content);
      assert.equal(s.preparing.value, false);
    } else assert.deepEqual([...s.queue.value], []);
    assert.equal(h.requests.filter(req => req.method !== 'GET').length, 0);
  } finally { hold.resolve(); await pending; }
});

for (const change of ['login', 'login-return', 'renewal']) test(`template confirmation preserves confirmed handwriting after ${change}, except ordinary renewal`, async () => {
  const store = h.newStore(); login(store);
  const {state: s, events} = await h.openComponent('/src/components/v2/PublicationComposer.vue', {});
  Object.assign(s.form, {subjectId: 'math', targetWorkspaceIds: ['class-a']});
  await nextTick();
  for (const [field, text] of [['content', '必须保留的手写确认正文'], ['optionalContent', '必须保留的选做第8题']]) {
    s.textTargets[field].apply(s.textTargets[field].capture(), text);
  }
  await nextTick();
  s.templatesOpen.value = true;
  const pending = s.applyTemplate({title: '模板标题', content: '模板必做', optionalContent: '模板选做', submission: '', materials: ''});
  try {
    assert.equal(s.templateApplying.value, true);
    replaceCredentials(change); await nextTick();
    h.dialogs.settleActionDialog(true); await pending;
    assert.equal(s.form.content, change === 'renewal' ? '模板必做' : '必须保留的手写确认正文');
    assert.equal(s.form.optionalContent, change === 'renewal' ? '模板选做' : '必须保留的选做第8题');
    assert.equal(s.templateApplying.value, false);
    assert.deepEqual(events, []); assert.equal(h.requests.length, 0);
  } finally { h.dialogs.settleActionDialog(false); await pending; }
});
