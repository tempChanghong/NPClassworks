import test from "node:test";
import assert from "node:assert/strict";
import {completePublicationFeed} from "../src/utils/completePublicationFeed.js";

const rows = Array.from({length: 205}, (_, i) => ({id: String(i).padStart(3, "0"), revision: 1,
  type: "NOTICE", priority: i === 204 ? "URGENT" : "NORMAL", publishAt: new Date(1000000 - i).toISOString()}));

test("complete feed drains every cursor page including the oldest urgent notice", async () => {
  const calls = [];
  const result = await completePublicationFeed(async params => {
    calls.push(params);
    const remaining = rows.filter(row => row.id > params.afterId);
    return {items: remaining.slice(0, 100), nextAfterId: remaining.length > 100 ? remaining[99].id : null,
      generatedAt: "2026-09-09T00:00:00Z", nextTransitionAt: calls.length === 1 ? "2099-01-01T00:00:00Z" : null};
  });
  assert.equal(calls.length, 3);
  assert.equal(result.items.length, 205);
  assert.equal(result.items.at(-1).priority, "URGENT");
  assert.equal(new Set(result.items.map(item => item.id)).size, 205);
  assert.equal(result.nextTransitionAt, "2099-01-01T00:00:00.000Z");
});

test("old API offset pages are followed until complete rather than raising the single-page limit", async () => {
  const skips = [];
  const result = await completePublicationFeed(async ({skip = 0}) => {
    skips.push(skip);
    return {items: rows.slice(skip, skip + 50), total: rows.length, limit: 50};
  });
  assert.deepEqual(skips, [0, 50, 100, 150, 200]);
  assert.equal(result.items.length, 205);
});

test("a failed later page rejects the complete load and repeated cursors cannot loop", async () => {
  let calls = 0;
  await assert.rejects(completePublicationFeed(async () => {
    if (++calls === 2) throw new Error("page failed");
    return {items: rows.slice(0, 100), nextAfterId: "099"};
  }), /page failed/);
  calls = 0;
  await assert.rejects(completePublicationFeed(async () => {
    calls++;
    return {items: rows.slice(0, 100), nextAfterId: "099"};
  }), /分页未能继续/);
  assert.equal(calls, 2);
});

test("scope changes stop draining and expiry during pagination is removed before display", async () => {
  let current = true, calls = 0;
  await assert.rejects(completePublicationFeed(async () => {
    calls++; current = false;
    return {items: rows.slice(0, 100), nextAfterId: "099"};
  }, {isCurrent: () => current}), /上下文已切换/);
  assert.equal(calls, 1);
  const result = await completePublicationFeed(async () => ({items: [
    {...rows[0], expiresAt: "2000-01-01T00:00:00Z"}, {...rows[1], type: "ASSIGNMENT"},
  ], nextAfterId: null}));
  assert.deepEqual(result.items.map(item => item.id), [rows[1].id]);
});
