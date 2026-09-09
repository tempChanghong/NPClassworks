import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";
import {filterTeacherPublications, teacherPublicationStats} from "../src/utils/teacherPublications.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

function pages() {
  const publications = Array.from({length: 101}, (_, index) => ({id: `p-${index}`, type: "ASSIGNMENT", status: "PUBLISHED",
    isCertified: true, content: index === 100 ? "末页唯一作业" : `作业${index}`, publishAt: "2026-01-01"}));
  const actions = Array.from({length: 51}, (_, index) => ({id: `a-${index}`, publication: publications[index],
    reason: index === 50 ? "CREATED_BY_SCREEN" : "CHANGED_AFTER_CERTIFICATION"}));
  const summary = {total: 51, changedAfterCertified: 50, createdByScreen: 1, other: 0};
  h.routes.set("GET /api/v2/publications", (req, reply) => {
    const skip = Number(req.query.get("skip"));
    reply({items: publications.slice(skip, skip + 100), total: publications.length});
  });
  h.routes.set("GET /api/v2/publications/action-required", (req, reply) => {
    const skip = Number(req.query.get("skip"));
    reply({items: actions.slice(skip, skip + 50), total: actions.length, summary});
  });
  return {publications, actions};
}

function verify(store) {
  assert.equal(teacherPublicationStats(store.teacherPublications).all, 101);
  assert.equal(filterTeacherPublications(store.teacherPublications, {query: "末页唯一作业"})[0]?.id, "p-100");
  assert.equal(store.teacherActionCenter.summary.createdByScreen, 1);
  assert.equal(store.teacherActionCenter.items.filter(item => item.reason === "CREATED_BY_SCREEN").length, 1);
}

test("teacher initialization loads later publications and later action categories", async () => {
  pages();
  h.storage.setItem("classworks-v2-access-token", "teacher-token");
  const store = h.newStore();
  await store.bootstrapTeacher();
  verify(store);
});

test("teacher refresh loads all pages and preserves complete data if a later page fails", async () => {
  pages();
  h.storage.setItem("classworks-v2-access-token", "teacher-token");
  const store = h.newStore(); store.account = {id: "teacher"};
  await Promise.all([store.refreshTeacherPublications(), store.refreshTeacherActionCenter()]);
  verify(store);
  const previousPublications = store.teacherPublications;
  const previousActions = store.teacherActionCenter;
  for (const path of ["/api/v2/publications", "/api/v2/publications/action-required"]) {
    h.routes.set(`GET ${path}`, (req, reply) => Number(req.query.get("skip"))
      ? reply({message: "第二页暂不可用"}, 503)
      : reply({items: [{id: "partial"}], total: 2}));
  }
  await Promise.all([store.refreshTeacherPublications(), store.refreshTeacherActionCenter()]);
  assert.equal(store.teacherPublications, previousPublications);
  assert.equal(store.teacherActionCenter, previousActions);
  assert.match(store.teacherError, /第二页暂不可用/);
});

test("an older paginated refresh cannot overwrite a newer teacher list", async () => {
  const store = h.newStore();
  const gate = deferred(); let calls = 0;
  h.routes.set("GET /api/v2/publications", async (_req, reply) => {
    const call = ++calls;
    if (call === 1) await gate.promise;
    reply({items: [{id: call === 1 ? "old" : "current"}], total: call === 1 ? 101 : 1});
  });
  const old = store.refreshTeacherPublications();
  await eventually(() => assert.equal(calls, 1));
  await store.refreshTeacherPublications();
  gate.resolve(); await old;
  assert.deepEqual(store.teacherPublications.map(item => item.id), ["current"]);
  assert.equal(calls, 2);
});

test("switching accounts during pagination prevents fetching or exposing remaining old-account records", async () => {
  const store = h.newStore();
  const gate = deferred(); let calls = 0;
  h.routes.set("GET /api/v2/publications", async (_req, reply) => {
    calls++; await gate.promise;
    reply({items: [{id: "old-account"}], total: 101});
  });
  const loading = store.refreshTeacherPublications();
  await eventually(() => assert.equal(calls, 1));
  store.teacherSessionVersion++;
  gate.resolve(); await loading;
  assert.deepEqual(store.teacherPublications, []);
  assert.equal(calls, 1);
});
