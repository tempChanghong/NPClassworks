import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

async function fillComposer(publication = null) {
  const editor = await h.openComposer(publication);
  Object.assign(editor.state.form, {subjectId: "math", targetWorkspaceId: "class-a", content: "完成练习册第 10 页"});
  await nextTick();
  return editor;
}

test("offline composer saves durably, closes only after success, and uploads once after recovery", async () => {
  const store = h.newStore({screen: true});
  store.screenNetworkOnline = false;
  const {state, events} = await fillComposer();
  await state.save();
  assert.equal(h.requests.length, 0);
  assert.equal(events.find(([name]) => name === "saved")[1].offlineQueued, true);
  assert.deepEqual(events.at(-1), ["update:modelValue", false]);
  assert.equal(h.queue.loadScreenPublicationQueue("screen-a").length, 1);
  assert.equal(h.drafts.loadScreenHomeworkDraft("screen-a", "new"), null);
  // A new store must recover the persisted queue, rather than relying on memory.
  const reloaded = h.newStore({screen: true});
  await Promise.all([reloaded.flushScreenPublicationQueue(), reloaded.flushScreenPublicationQueue()]);
  assert.equal(h.publications.length, 1);
  assert.equal(h.publications[0].content, state.form.content);
  assert.equal(reloaded.feed[0].id, h.publications[0].id);
  assert.equal(h.queue.loadScreenPublicationQueue("screen-a").length, 0);
  assert.equal(reloaded.screenSyncing, false);
  const upload = h.requests.find((req) => req.method === "POST");
  assert.equal(upload.headers["x-classworks-screen-token"], "screen-a-token");
});

test("storage failure leaves the composer open, retains input and draft, and emits no success", async () => {
  const store = h.newStore({screen: true});
  store.screenNetworkOnline = false;
  const {state, events} = await fillComposer();
  const write = h.storage.setItem;
  h.storage.setItem = (key, value) => {
    if (key.startsWith("classworks-v2-screen-publication-queue:")) throw new Error("QuotaExceededError");
    write(key, value);
  };
  try {
    await state.save();
    assert.deepEqual(events, []);
    assert.match(state.localError.value, /未能保存/);
    assert.equal(state.form.content, "完成练习册第 10 页");
    assert.equal(h.drafts.loadScreenHomeworkDraft("screen-a", "new").content, state.form.content);
    assert.equal(store.screenPendingUploads.length, 0);
    assert.equal(state.saving.value, false);
  } finally { h.storage.setItem = write; }
  await state.save();
  assert.equal(events.filter(([name]) => name === "saved").length, 1);
});

test("temporary HTTP failure queues new work and automatic retry drains it after recovery", async () => {
  const store = h.newStore({screen: true});
  const path = "POST /api/v2/classroom-screens/publications";
  const healthy = h.routes.get(path);
  h.routes.set(path, (_req, reply) => reply({message: "temporarily unavailable"}, 503));
  const saved = await store.saveScreenPublication({content: "离线补传"});
  assert.equal(saved.offlineQueued, true);
  await store.flushScreenPublicationQueue();
  assert.equal(store.screenPendingUploads.length, 1);
  assert.equal(store.screenPendingUploads[0].status, "pending");
  h.routes.set(path, healthy);
  await store.flushScreenPublicationQueue();
  assert.equal(store.screenPendingUploads.length, 0);
  assert.equal(store.feed[0].content, "离线补传");
});

test("validation failure enters manual review and is never retried automatically", async () => {
  const store = h.newStore({screen: true});
  store.screenNetworkOnline = false;
  await store.saveScreenPublication({content: "需核对"});
  h.routes.set("POST /api/v2/classroom-screens/publications", (_req, reply) => reply({
    code: "DUPLICATE_ASSIGNMENT_SUSPECTED", message: "疑似重复作业",
  }, 409));
  store.screenNetworkOnline = true;
  await store.flushScreenPublicationQueue();
  assert.equal(store.screenPendingUploads[0].status, "needs_review");
  const count = h.requests.length;
  await store.flushScreenPublicationQueue();
  assert.equal(h.requests.length, count);
  assert.equal(h.publications.length, 0);
});

test("screen rebinding cannot upload another screen's pending work", async () => {
  const store = h.newStore({screen: true});
  store.screenNetworkOnline = false;
  await store.saveScreenPublication({content: "A 班作业"});
  store.screenSession = {binding: {id: "screen-b"}, workspaces: []};
  store.screenNetworkOnline = true;
  await store.flushScreenPublicationQueue();
  assert.equal(h.requests.length, 0);
  assert.equal(h.queue.loadScreenPublicationQueue("screen-a").length, 1);
  assert.equal(store.screenPendingUploads.length, 0);
});

test("revision conflict retains local edits and loads the server version without overwriting it", async () => {
  const store = h.newStore({screen: true});
  const old = {id: "publication-1", revision: 1, subjectId: "math", content: "原始内容",
    targets: [{workspaceId: "class-a"}], boardDate: store.boardDate};
  const latest = {...old, revision: 2, content: "其他教师已修改", isCertified: true};
  h.routes.set("PATCH /api/v2/classroom-screens/publications/publication-1", (_req, reply) => reply({
    code: "PUBLICATION_REVISION_CONFLICT", message: "版本冲突", details: {revision: 2, isCertified: true},
  }, 409));
  h.routes.set("GET /api/v2/classroom-screens/publications/publication-1", (_req, reply) => reply(latest));
  const {state, events} = await fillComposer(old);
  await state.save();
  assert.equal(h.requests[0].headers["if-match"], '"1"');
  assert.equal(state.conflict.value.latestPublication.content, latest.content);
  assert.equal(state.conflict.value.latestRevision, 2);
  assert.equal(state.form.content, "完成练习册第 10 页");
  assert.deepEqual(events, []);
  assert.equal(h.queue.loadScreenPublicationQueue("screen-a").length, 0);
  assert.equal(h.drafts.loadScreenHomeworkDraft("screen-a", old.id).content, state.form.content);
  // Explicitly accepting local edits must use the latest revision, never force-overwrite v1.
  h.routes.set("PATCH /api/v2/classroom-screens/publications/publication-1", (req, reply) => {
    assert.equal(req.headers["if-match"], '"2"');
    reply({...latest, ...req.body, revision: 3});
  });
  const apply = state.applyLocalOnLatest();
  assert.equal(h.dialogs.actionDialogState.open, true);
  h.dialogs.settleActionDialog(true);
  await apply;
  assert.equal(events.find(([name]) => name === "saved")[1].revision, 3);
  assert.deepEqual(events.at(-1), ["update:modelValue", false]);
  assert.equal(h.drafts.loadScreenHomeworkDraft("screen-a", old.id), null);
});

test("offline edits of existing work keep the editor open and never create a new queued copy", async () => {
  const store = h.newStore({screen: true});
  store.screenNetworkOnline = false;
  const {state, events} = await fillComposer({id: "existing", revision: 1, subjectId: "math",
    targets: [{workspaceId: "class-a"}], boardDate: store.boardDate});
  await state.save();
  assert.match(state.localError.value, /不能修改/);
  assert.equal(h.requests.length, 0);
  assert.equal(store.screenPendingUploads.length, 0);
  assert.deepEqual(events, []);
  assert.equal(h.drafts.loadScreenHomeworkDraft("screen-a", "existing").content, state.form.content);
});

test("expired work waits for explicit retry and does not block newer automatic uploads", async () => {
  const store = h.newStore({screen: true});
  h.queue.enqueueScreenPublication("screen-a", {content: "旧作业"}, {}, h.storage, Date.now() - 8 * 86400000);
  h.queue.enqueueScreenPublication("screen-a", {content: "新作业"}, {}, h.storage);
  await store.flushScreenPublicationQueue();
  assert.deepEqual(h.publications.map((item) => item.content), ["新作业"]);
  assert.equal(store.screenPendingUploads[0].status, "needs_review");
  await store.retryScreenQueuedPublication(store.screenPendingUploads[0].id);
  assert.equal(store.screenPendingUploads.length, 0);
  assert.deepEqual(h.publications.map((item) => item.content), ["新作业", "旧作业"]);
});

test("a failed logout request still clears local teacher access", async () => {
  const store = h.newStore();
  h.api.saveAccountTokens({accessToken: "teacher-a", refreshToken: "refresh-a"});
  await store.bootstrapTeacher();
  h.routes.set("POST /accounts/logout", (_req, reply) => reply({message: "offline"}, 503));
  await store.signOutTeacher();
  assert.equal(store.isTeacherSignedIn, false);
  assert.equal(store.teacherWorkspaces.length, 0);
  assert.deepEqual(h.api.getAccountTokens(), {accessToken: "", refreshToken: ""});
});

test("a late bootstrap cannot restore the old account after signout", async () => {
  const store = h.newStore();
  h.api.saveAccountTokens({accessToken: "teacher-a"});
  const started = deferred(); const release = deferred();
  h.routes.set("GET /accounts/profile", async (_req, reply) => {
    started.resolve(); await release.promise; reply({id: "teacher-a"});
  });
  const loading = store.bootstrapTeacher();
  await started.promise;
  try { await store.signOutTeacher(); } finally { release.resolve(); }
  await loading;
  assert.equal(store.account, null);
  assert.equal(store.memberships.length, 0);
  assert.equal(store.teacherLoading, false);
});

for (const operation of ["refreshTeacherActionCenter", "hydrateTeacherTargetPreferences", "syncTeacherTargetPreferences"]) {
  test(`late ${operation} results do not overwrite the new session`, async () => {
    const store = h.newStore();
    h.api.saveAccountTokens({accessToken: "teacher-a"});
    await store.bootstrapTeacher();
    const started = deferred(); const release = deferred();
    const path = operation === "refreshTeacherActionCenter"
      ? "GET /api/v2/publications/action-required"
      : `${operation === "syncTeacherTargetPreferences" ? "PUT" : "GET"} /accounts/preferences/teacher-targets`;
    const healthy = h.routes.get(path);
    h.routes.set(path, async (req, reply) => {
      if (req.headers.authorization === "Bearer teacher-a") {
        started.resolve(); await release.promise;
        reply(operation === "refreshTeacherActionCenter"
          ? {items: [{id: "private-a"}], total: 1}
          : {preferences: {favorites: [{type: "ASSIGNMENT", subjectId: "math", targetWorkspaceIds: ["private-a"]}], recent: []}});
      } else if (healthy) healthy(req, reply);
      else reply({preferences: {favorites: [], recent: []}});
    });
    const request = store[operation]();
    await started.promise;
    try {
      await store.signOutTeacher();
      h.api.saveAccountTokens({accessToken: "teacher-b"});
      await store.bootstrapTeacher();
    } finally { release.resolve(); }
    await request;
    assert.equal(store.account.id, "teacher-b");
    assert.equal(store.teacherActionCenter.items.length, 0);
    assert.equal(store.teacherTargetPreferences.favorites.length, 0);
    assert.equal(store.teacherTargetPreferencesSyncing, false);
  });
}

test("signing out clears teacher permissions and the next account uses its own credentials", async () => {
  const store = h.newStore();
  h.api.saveAccountTokens({accessToken: "teacher-a"});
  await store.bootstrapTeacher();
  assert.equal(store.account.id, "teacher-a");
  assert.equal(store.teacherWorkspaces.length, 1);
  await store.signOutTeacher();
  assert.equal(store.account, null);
  assert.equal(store.teacherWorkspaces.length, 0);
  assert.equal(store.schoolMemberships.length, 0);
  assert.equal(h.api.getAccountTokens().accessToken, "");
  h.api.saveAccountTokens({accessToken: "teacher-b"});
  await store.bootstrapTeacher();
  assert.equal(store.account.id, "teacher-b");
  const profiles = h.requests.filter((req) => req.path === "/accounts/profile");
  assert.deepEqual(profiles.map((req) => req.headers.authorization), ["Bearer teacher-a", "Bearer teacher-b"]);
});

test("a late publication response from a signed-out teacher cannot populate the next account", async () => {
  const store = h.newStore();
  h.api.saveAccountTokens({accessToken: "teacher-a"});
  await store.bootstrapTeacher();
  const started = deferred();
  const release = deferred();
  h.routes.set("GET /api/v2/publications", async (req, reply) => {
    if (req.headers.authorization === "Bearer teacher-a") {
      started.resolve(); await release.promise;
      reply({items: [{id: "private-a"}]});
    } else reply({items: [{id: "private-b"}]});
  });
  const oldRefresh = store.refreshTeacherPublications();
  await started.promise;
  try {
    await store.signOutTeacher();
    h.api.saveAccountTokens({accessToken: "teacher-b"});
    await store.bootstrapTeacher();
  } finally { release.resolve(); }
  await oldRefresh;
  assert.equal(store.account.id, "teacher-b");
  assert.deepEqual(store.teacherPublications.map((item) => item.id), ["private-b"]);
});

test("teacher publication reaches an independent screen store through invalidation and HTTP refresh", async () => {
  const teacher = h.newStore();
  h.api.saveAccountTokens({accessToken: "teacher-a"});
  await teacher.bootstrapTeacher();
  const screen = h.newStore({screen: true});
  screen.startRealtime();
  try {
    const publication = await teacher.publish({content: "明天交数学练习", status: "PUBLISHED"});
    assert.equal(screen.feed.length, 0);
    assert.ok(h.realtime.rooms.has("class-a"));
    h.realtime.emitServerEvent("publication.created", {workspaceIds: ["class-a"], publicationId: publication.id});
    await eventually(() => assert.equal(screen.feed[0]?.id, publication.id));
    assert.equal(screen.feed[0].content, "明天交数学练习");
    assert.ok(h.requests.some((req) => req.path === "/api/v2/classroom-screens/feed"));
  } finally { screen.stopRealtime(); }
});
