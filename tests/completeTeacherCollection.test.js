import assert from "node:assert/strict";
import test from "node:test";
import {completeTeacherCollection} from "../src/utils/completeTeacherCollection.js";

test("teacher collections follow actual page lengths and preserve all item types", async () => {
  const items = Array.from({length: 101}, (_, i) => ({id: `p-${i}`, type: "NOTICE", status: "DRAFT", expiresAt: "2020-01-01"}));
  const skips = [];
  const result = await completeTeacherCollection(async ({skip}) => {
    skips.push(skip);
    return {items: items.slice(skip, skip + 50), total: items.length};
  });
  assert.deepEqual(skips, [0, 50, 100]);
  assert.deepEqual(result.items, items);
  assert.equal(result.total, 101);
});

test("incomplete, repeated and changing pages fail instead of returning partial lists", async () => {
  for (const next of [
    {items: [], total: 2},
    {items: [{id: "first"}], total: 2},
    {items: [{id: "second"}], total: 3},
    {items: [{id: "second"}], total: 2, summary: {total: 2, createdByScreen: 1}},
  ]) {
    await assert.rejects(completeTeacherCollection(async ({skip}) => skip ? next : {items: [{id: "first"}], total: 2}));
  }
});

test("obsolete teacher collection requests stop before asking for another page", async () => {
  let current = true;
  let requests = 0;
  const result = await completeTeacherCollection(async () => {
    requests++; current = false;
    return {items: [{id: "old-account"}], total: 200};
  }, {isCurrent: () => current});
  assert.equal(result, null);
  assert.equal(requests, 1);
});
