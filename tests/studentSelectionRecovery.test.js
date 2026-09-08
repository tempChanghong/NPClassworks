import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, deferred} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

function setup() {
  const store = h.newStore();
  store.feedAudience = "student";
  store.selection = {schoolId: "school", administrativeClassId: "class-a",
    courseGroupIds: {physics: "stopped", chemistry: "active"}, declinedSubjectIds: []};
  const options = {administrativeClass: {id: "class-a"}, subjects: [
    {subject: {id: "physics", name: "物理"}, requiresCourseGroupSelection: true, courseGroups: [{id: "replacement"}]},
    {subject: {id: "chemistry", name: "化学"}, requiresCourseGroupSelection: true, courseGroups: [{id: "active"}]},
  ]};
  h.routes.set("GET /api/v2/catalog/administrative-classes/class-a/course-options", (_req, reply) => reply(options));
  const feeds = [];
  h.routes.set("GET /api/v2/publications/feed", (req, reply) => {
    const ids = req.query.get("workspaceIds").split(",");
    feeds.push(ids);
    if (ids.includes("stopped")) reply({code: "WORKSPACE_NOT_FOUND", message: "部分目标已停用"}, 404);
    else reply({items: [{id: "normal-homework", content: "正常行政班作业"}], generatedAt: new Date().toISOString()});
  });
  return {store, options, feeds};
}

test("a stopped group is removed after feed rejection without losing valid class and group selections", async () => {
  const {store, feeds} = setup();
  await store.loadStudentFeed();
  assert.deepEqual(store.selection.courseGroupIds, {chemistry: "active"});
  assert.equal(store.selectionNeedsConfirmation, true);
  assert.equal(store.selectionDialog, true);
  assert.equal(store.feed[0].id, "normal-homework");
  assert.equal(store.feedLoadError, "");
  assert.deepEqual(feeds, [["class-a", "stopped", "active"], ["class-a", "active"]]);
  assert.deepEqual(JSON.parse(h.storage.getItem("classworks-v2-student-selection")).courseGroupIds, {chemistry: "active"});
});

test("unchanged or unreachable catalogs do not retry a failing feed indefinitely", async () => {
  const {store, options, feeds} = setup();
  options.subjects[0].courseGroups = [{id: "stopped"}];
  await store.loadStudentFeed();
  assert.equal(feeds.length, 1);
  assert.ok(store.feedLoadError);
  h.routes.set("GET /api/v2/catalog/administrative-classes/class-a/course-options", (_req, reply) => reply({message: "offline"}, 503));
  await store.loadStudentFeed();
  assert.equal(feeds.length, 2);
  assert.equal(store.selection.courseGroupIds.physics, "stopped");
});

test("a late recovery catalog cannot overwrite a newly selected class", async () => {
  const {store, options} = setup();
  const reached = deferred(), release = deferred();
  h.routes.set("GET /api/v2/catalog/administrative-classes/class-a/course-options", async (_req, reply) => {
    reached.resolve(); await release.promise; reply(options);
  });
  const pending = store.loadStudentFeed();
  await Promise.race([reached.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("recovery not reached")), 3000))]);
  store.selection = {schoolId: "other", administrativeClassId: "class-b", courseGroupIds: {physics: "new-group"}};
  release.resolve();
  await pending;
  assert.equal(store.selection.administrativeClassId, "class-b");
  assert.equal(store.selection.courseGroupIds.physics, "new-group");
});

test("temporary feed errors preserve choices and do not fetch replacement options", async () => {
  const {store} = setup();
  let catalogs = 0;
  h.routes.set("GET /api/v2/catalog/administrative-classes/class-a/course-options", (_req, reply) => {
    catalogs++; reply({});
  });
  h.routes.set("GET /api/v2/publications/feed", (_req, reply) => reply({message: "暂时无法连接"}, 503));
  await store.loadStudentFeed();
  assert.equal(catalogs, 0);
  assert.equal(store.selection.courseGroupIds.physics, "stopped");
  assert.ok(store.feedLoadError);
});

test("a second unavailable workspace response stops after one recovery retry", async () => {
  const {store} = setup();
  let requests = 0;
  h.routes.set("GET /api/v2/publications/feed", (_req, reply) => {
    requests++; reply({code: "WORKSPACE_NOT_FOUND", message: "行政班也已停用"}, 404);
  });
  await store.loadStudentFeed();
  assert.equal(requests, 2);
  assert.equal(store.selection.administrativeClassId, "class-a");
  assert.equal(store.selection.courseGroupIds.chemistry, "active");
  assert.ok(store.feedLoadError);
});
