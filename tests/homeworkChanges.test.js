import test from "node:test";
import assert from "node:assert/strict";
import {createHomeworkChangeTracker, homeworkChangeSnapshot, homeworkChangeExcerpt, HOMEWORK_CHANGE_DURATION} from "../src/utils/homeworkChanges.js";

const publication = {id: "a", type: "ASSIGNMENT", status: "PUBLISHED", revision: 1, boardDate: "2026-09-07",
  subject: {name: "数学"}, content: "完成第10页", targets: [{workspaceId: "class", workspace: {name: "一班"}}]};
const snapshot = items => homeworkChangeSnapshot(items, "2026-09-07", ["class"]);
test("first load is a baseline; actual content changes highlight but certification and refresh do not", () => {
  const tracker = createHomeworkChangeTracker();
  assert.deepEqual(tracker.update(snapshot([publication]), {now: 0}), []);
  assert.deepEqual(tracker.update(snapshot([{...publication, revision: 2, isCertified: true}]), {now: 1}), []);
  const changed = {...publication, revision: 3, content: "完成第12页"};
  const [event] = tracker.update(snapshot([changed]), {now: 2});
  assert.equal(event.changes.length, 1);
  assert.equal(event.changes[0].before, "完成第10页");
  assert.equal(event.changes[0].after, "完成第12页");
  assert.equal(tracker.update(snapshot([{...changed, revision: 4, isCertified: true}]), {now: 9})[0].expiresAt, 2 + HOMEWORK_CHANGE_DURATION);
  assert.equal(tracker.current(HOMEWORK_CHANGE_DURATION + 2).length, 0);
  assert.equal(tracker.update(snapshot([changed]), {now: HOMEWORK_CHANGE_DURATION + 3}).length, 0);
});

test("consecutive edits retain earliest displayed text, revert clears warning, dismissal does not repeat", () => {
  const tracker = createHomeworkChangeTracker();
  tracker.update(snapshot([publication]), {now: 0});
  tracker.update(snapshot([{...publication, revision: 2, content: "第二版"}]), {now: 1});
  const [event] = tracker.update(snapshot([{...publication, revision: 3, content: "第三版"}]), {now: 2});
  assert.equal(event.before.content, publication.content); assert.equal(event.after.content, "第三版");
  assert.equal(tracker.update(snapshot([{...publication, revision: 4}]), {now: 3}).length, 0);
  tracker.update(snapshot([{...publication, revision: 5, content: "最终版"}]), {now: 4});
  tracker.dismiss();
  assert.equal(tracker.update(snapshot([{...publication, revision: 5, content: "最终版"}]), {now: 5}).length, 0);
});

test("offline fallback and older revisions do not overwrite baseline; reconnect can show a real correction", () => {
  const tracker = createHomeworkChangeTracker();
  tracker.update(snapshot([publication]), {cached: true, now: 0});
  tracker.update(snapshot([{...publication, revision: 2, content: "新内容"}]), {now: 1});
  tracker.update(snapshot([publication]), {cached: true, now: 2});
  tracker.update(snapshot([publication]), {now: 3});
  tracker.dismiss();
  assert.equal(tracker.update(snapshot([{...publication, revision: 2, content: "新内容"}]), {now: 4}).length, 0);
  tracker.reset();
  assert.equal(tracker.update(snapshot([{...publication, content: "切换班级后初次加载"}]), {now: 5}).length, 0);
});

test("new homework following a no-homework marker is highlighted and unrelated dates/scopes are excluded", () => {
  const tracker = createHomeworkChangeTracker();
  const marker = {...publication, contentJson: {kind: "NO_HOMEWORK", version: 1}, title: "今日无作业", content: "本日该科目无作业。"};
  tracker.update(snapshot([marker]), {now: 0});
  const [event] = tracker.update(snapshot([marker, {...publication, id: "new"}]), {now: 1});
  assert.equal(event.before, null); assert.equal(event.after.content, publication.content);
  assert.equal(snapshot([{...publication, boardDate: "2026-09-08"}, {...publication, type: "NOTICE"},
    {...publication, status: "DRAFT"}, {...publication, targets: [{workspaceId: "elsewhere"}]}]).length, 0);
});

test("snapshot detaches mutable publications and summary reveals changes after a long shared prefix", () => {
  const item = globalThis.structuredClone(publication), [copy] = snapshot([item]);
  item.content = "later"; item.targets[0].workspace.name = "changed";
  assert.equal(copy.content, publication.content); assert.equal(copy.targets, "一班");
  const excerpt = homeworkChangeExcerpt("同".repeat(200) + "10页", "同".repeat(200) + "12页");
  assert.match(excerpt.before, /10页/); assert.match(excerpt.after, /12页/);
});
