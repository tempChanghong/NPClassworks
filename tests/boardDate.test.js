import test from "node:test";
import assert from "node:assert/strict";
import {
  boardDateRelativeLabel,
  sanitizeBoardDate,
  shiftBoardDate,
  todayBoardDate,
} from "../src/utils/boardDate.js";

test("board dates are formatted without UTC drift", () => {
  assert.equal(todayBoardDate(new Date(2026, 7, 10, 0, 5)), "2026-08-10");
});

test("board date navigation crosses month boundaries", () => {
  assert.equal(shiftBoardDate("2026-08-01", -1), "2026-07-31");
  assert.equal(shiftBoardDate("2026-08-31", 1), "2026-09-01");
});

test("impossible dates are rejected and nearby dates receive familiar labels", () => {
  assert.equal(sanitizeBoardDate("2026-02-30", "2026-08-10"), "2026-08-10");
  assert.equal(boardDateRelativeLabel("2026-08-09", "2026-08-10"), "昨天");
  assert.equal(boardDateRelativeLabel("2026-08-11", "2026-08-10"), "明天");
});
