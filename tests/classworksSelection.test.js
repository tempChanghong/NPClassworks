import test from "node:test";
import assert from "node:assert/strict";
import {
  publicationTransitionDelay,
  sanitizeCourseGroupIds,
} from "../src/utils/classworksSelection.js";

const courseOptions = {
  subjects: [
    {
      subject: {id: "physics"},
      requiresCourseGroupSelection: true,
      courseGroups: [{id: "physics-a1"}, {id: "physics-a2"}],
    },
    {
      subject: {id: "chemistry"},
      requiresCourseGroupSelection: false,
      courseGroups: [],
    },
  ],
};

test("saved walking-class choices are limited to current course options", () => {
  assert.deepEqual(
    sanitizeCourseGroupIds(courseOptions, {
      physics: "physics-a1",
      chemistry: "chemistry-a1",
      history: "history-b1",
    }),
    {physics: "physics-a1"},
  );
  assert.deepEqual(
    sanitizeCourseGroupIds(courseOptions, {physics: "physics-old"}),
    {},
  );
});

test("scheduled feed refresh waits until just after the server boundary", () => {
  assert.equal(
    publicationTransitionDelay("2026-08-09T10:00:10.000Z", Date.parse("2026-08-09T10:00:00.000Z")),
    10_250,
  );
  assert.equal(publicationTransitionDelay(null), null);
});
