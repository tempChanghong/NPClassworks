import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicationRevisionConflict,
  publicationConflictMessage,
  publicationConflictState,
} from "../src/utils/publicationConflict.js";

function conflictError(details = {}) {
  return {
    response: {
      status: 409,
      data: {code: "PUBLICATION_REVISION_CONFLICT", details},
    },
  };
}

test("only publication revision conflicts enter the merge flow", () => {
  assert.equal(isPublicationRevisionConflict(conflictError()), true);
  assert.equal(isPublicationRevisionConflict({response: {status: 409, data: {code: "OTHER"}}}), false);
  assert.equal(isPublicationRevisionConflict({response: {status: 422}}), false);
});

test("conflict state retains expected and latest revisions", () => {
  const state = publicationConflictState(conflictError({
    revision: 7,
    updatedAt: "2026-08-18T12:00:00.000Z",
    isCertified: false,
  }), 5);
  assert.deepEqual(state, {
    expectedRevision: 5,
    latestRevision: 7,
    latestUpdatedAt: "2026-08-18T12:00:00.000Z",
    latestCertified: false,
  });
  assert.match(publicationConflictMessage(state), /版本 5/);
  assert.match(publicationConflictMessage(state), /版本 7/);
  assert.match(publicationConflictMessage(state), /没有覆盖任何内容/);
});
