import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());
const source = id => ({id, subjectId: "math", type: "ASSIGNMENT", status: "PUBLISHED", title: id,
  content: "原正文", boardDate: "2020-01-01", publishAt: "2020-01-01T00:00:00Z"});
async function dialog() {
  const store = h.newStore();
  store.account = {id: "teacher"};
  store.teacherSubjects = [{id: "math", name: "数学"}];
  store.eligibleTeacherWorkspaces = () => [h.workspace];
  store.teacherPublications = [source("A"), source("B")];
  const component = await h.openComponent("/src/components/v2/TeacherHomeworkReuse.vue", {});
  await nextTick();
  return {store, ...component};
}

for (const change of [{boardDate: "2020-01-02"}, {status: "DRAFT"}, {subjectId: "no-longer-available"}]) {
test(`list refresh removes only invalid history selections: ${JSON.stringify(change)}`, async () => {
  const {store, state: s} = await dialog();
  s.selected.value = ["A", "B"];
  store.teacherPublications = [{...source("A"), ...change}, {...source("B"), content: "只更新正文"}];
  await nextTick();
  assert.deepEqual([...s.selected.value], ["B"]);
  assert.match(s.error.value, /所选作业已不在当前日期或已不可复用/);
  s.sourceDate.value = "2020-01-02";
  await nextTick();
  assert.deepEqual([...s.selected.value], []);
  assert.equal(s.error.value, "");
});
}

test("an invalidated earlier selection prevents a partially read batch from entering the editor", async () => {
  const {store, state: s} = await dialog();
  s.selected.value = ["A", "B"];
  const gate = deferred(); let secondStarted = false;
  store.latestPublication = async id => {
    if (id === "B") { secondStarted = true; await gate.promise; }
    return source(id);
  };
  const pending = s.prepare();
  await eventually(() => assert.equal(secondStarted, true));
  store.teacherPublications = [{...source("A"), status: "DRAFT"}, source("B")];
  gate.resolve(); await pending;
  assert.equal(s.queue.value.length, 0);
  assert.deepEqual([...s.selected.value], ["B"]);
  assert.match(s.error.value, /列表已变化/);
  assert.equal(s.preparing.value, false);
});
