import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());
const path = "GET /api/v2/classroom-screens/feed";
const item = {id: "work", subjectId: "math", content: "上次完整内容"};

async function open(items = [item]) {
  const store = h.newStore({screen: true});
  store.boardDate = "2026-09-07";
  h.routes.set(path, (req, reply) => reply({weekStart: req.query.get("weekStart"), weekView: req.query.get("weekView"), total: items.length, items}));
  const {state: s, props} = await h.openComponent("/src/components/v2/HomeworkWeekButton.vue", {className: "一班"});
  s.open();
  await eventually(() => assert.equal(s.hasSnapshot.value, true));
  return {s, store, props};
}

for (const items of [[item], []]) {
  test(`same-query refresh keeps the last complete ${items.length ? "populated" : "empty"} snapshot while loading and on failure`, async () => {
    const {s} = await open(items);
    const timestamp = s.loadedAt.value;
    const gate = deferred();
    h.routes.set(path, async (_req, reply) => { await gate.promise; reply({message: "temporary failure"}, 503); });
    const pending = s.reload();
    try {
      assert.equal(s.loading.value, true);
      assert.equal(s.hasSnapshot.value, true);
      assert.deepEqual(s.items.value, items);
      gate.resolve(); await pending;
      assert.match(s.error.value, /temporary failure/);
      assert.equal(s.hasSnapshot.value, true);
      assert.deepEqual(s.items.value, items);
      assert.equal(s.loadedAt.value, timestamp);
    } finally { gate.resolve(); await pending; }
  });
}

for (const change of [s => { s.start.value = "2026-09-14"; }, s => { s.view.value = "due"; }]) {
  test(`changed ${change.toString().includes("start") ? "week" : "view"} clears the prior snapshot even if the new request fails`, async () => {
    const {s} = await open();
    h.routes.set(path, (_req, reply) => reply({message: "new query failed"}, 503));
    change(s);
    assert.equal(s.hasSnapshot.value, false);
    await eventually(() => assert.match(s.error.value, /new query failed/));
    assert.deepEqual(s.items.value, []);
    assert.equal(s.loadedAt.value, null);
  });
}

test("late success after class change cannot restore a closed snapshot", async () => {
  const {s, props} = await open();
  const gate = deferred();
  h.routes.set(path, async (req, reply) => {
    await gate.promise;
    reply({weekStart: req.query.get("weekStart"), weekView: "board", total: 1, items: [item]});
  });
  const pending = s.reload();
  props.className = "二班";
  try {
    await eventually(() => assert.equal(s.opened.value, false));
    gate.resolve(); await pending;
    assert.equal(s.hasSnapshot.value, false);
    assert.deepEqual(s.items.value, []);
  } finally { gate.resolve(); await pending; }
});

test("a permission rejection clears a previously successful private snapshot", async () => {
  const {s} = await open();
  h.routes.set(path, (_req, reply) => reply({message: "permission revoked"}, 403));
  await s.reload();
  assert.equal(s.hasSnapshot.value, false);
  assert.deepEqual(s.items.value, []);
  assert.match(s.error.value, /permission revoked/);
});
