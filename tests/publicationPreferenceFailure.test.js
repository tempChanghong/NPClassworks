import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

for (const editedWhileSaving of [false, true]) {
  test(`preference storage failure cannot turn a successful publication into a failed create (${editedWhileSaving ? "newer input" : "unchanged input"})`, async t => {
    const store = h.newStore();
    h.api.saveAccountTokens({accessToken: "teacher-a"});
    await store.bootstrapTeacher();
    const {state: s, events} = await h.openComponent("/src/components/v2/PublicationComposer.vue", {editingPublication: null});
    s.form.subjectId = "math"; await nextTick();
    s.form.targetWorkspaceIds = ["class-a"];
    s.form.content = "提交的作业";
    const started = deferred(), release = deferred();
    const post = h.routes.get("POST /api/v2/publications");
    h.routes.set("POST /api/v2/publications", async (req, reply) => { started.resolve(); await release.promise; post(req, reply); });
    const setItem = h.storage.setItem;
    t.mock.method(h.storage, "setItem", (key, value) => {
      if (key.startsWith("classworks-v2-teacher-targets:")) throw new Error("QuotaExceededError");
      return setItem(key, value);
    });
    const pending = s.submit("PUBLISHED");
    await started.promise;
    try { if (editedWhileSaving) s.form.content = "提交后继续输入"; } finally { release.resolve(); }
    await pending;
    assert.equal(h.publications.length, 1);
    assert.equal(events.filter(event => event[0] === "published").length, 1);
    assert.equal(s.localError.value, "");
    assert.match(store.teacherTargetPreferencesError, /不影响发布结果/);
    if (editedWhileSaving) {
      assert.equal(s.form.content, "提交后继续输入");
      assert.equal(s.editingBase.value.id, h.publications[0].id);
      h.routes.set(`PATCH /api/v2/publications/${h.publications[0].id}`, (req, reply) => {
        Object.assign(h.publications[0], req.body, {revision: 2}); reply(h.publications[0]);
      });
      await s.submit("PUBLISHED");
      assert.equal(h.publications[0].content, "提交后继续输入");
      assert.equal(h.publications[0].revision, 2);
    } else {
      assert.equal(s.form.content, "");
      await s.submit("PUBLISHED");
    }
    assert.equal(h.requests.filter(req => req.method === "POST" && req.path === "/api/v2/publications").length, 1);
  });
}
