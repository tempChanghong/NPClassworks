import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {nextTick} from "vue";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";
import {publicationHistoryPage} from "../src/utils/publicationHistoryPage.js";

let h;
const rows = Array.from({length: 45}, (_, i) => ({id: `history-${45-i}`, revision: 45-i, snapshot: {content: `正文${45-i}`}}));
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());

for (const mode of ["teacher", "screen"]) for (const legacy of [false, true]) {
  test(`${mode} history pages with ${legacy ? "legacy" : "paged"} API, preserving loaded rows on retry`, async () => {
    h.newStore({screen: true});
    const path = `/api/v2/${mode === "screen" ? "classroom-screens/" : ""}publications/work/revisions`;
    let fail = false;
    h.routes.set(`GET ${path}`, (req, reply) => {
      if (fail) return reply({message: "临时失败"}, 503);
      reply(legacy ? rows : publicationHistoryPage(rows, {limit: Number(req.query.get("limit")),
        ...(req.query.has("beforeRevision") ? {beforeRevision: Number(req.query.get("beforeRevision"))} : {})}));
    });
    const {state, props} = await h.openHistory({id: "work", revision: 45}, mode);
    await eventually(() => assert.equal(state.revisions.value.length, 20));
    assert.equal(h.requests[0].query.get("limit"), "20");
    props.publication = {...props.publication};
    await nextTick();
    assert.equal(state.revisions.value.length, 20, "same publication updates must not restart pagination");
    fail = true; await state.loadMore();
    assert.equal(state.revisions.value.length, 20);
    assert.equal(state.nextBeforeRevision.value, 26);
    assert.equal(state.error.value, "临时失败");
    fail = false;
    await Promise.all([state.loadMore(), state.loadMore()]);
    assert.equal(state.revisions.value.length, 40);
    await state.loadMore();
    assert.equal(state.revisions.value.length, 45);
    assert.equal(new Set(state.revisions.value.map(row => row.id)).size, 45);
    assert.equal(state.nextBeforeRevision.value, null);
    assert.equal(h.requests.filter(req => req.path === path).length, 4);
  });
}

test("late history pages cannot populate a different publication or reopened dialog", async () => {
  h.newStore({screen: true});
  const response = deferred();
  h.routes.set("GET /api/v2/publications/old/revisions", async (_req, reply) => {
    await response.promise; reply({items: rows.slice(0, 20), nextBeforeRevision: 26});
  });
  h.routes.set("GET /api/v2/publications/new/revisions", (_req, reply) => reply({items: [{id: "new", revision: 1}], nextBeforeRevision: null}));
  const dialog = await h.openHistory({id: "old", revision: 45});
  try {
    await eventually(() => assert.equal(h.requests.length, 1));
    dialog.props.modelValue = false; await nextTick();
    dialog.props.publication = {id: "new", revision: 1};
    dialog.props.modelValue = true; await nextTick();
    await eventually(() => assert.equal(dialog.state.revisions.value[0]?.id, "new"));
    response.resolve();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(dialog.state.revisions.value.length, 1);
    assert.equal(dialog.state.revisions.value[0].id, "new");
  } finally { response.resolve(); }
});
