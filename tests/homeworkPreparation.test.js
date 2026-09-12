import {test} from "node:test";
import assert from "node:assert/strict";
import {preparationOf, preparationList, preparationToday, splitPreparationFeed, withPreparation} from "../src/utils/homeworkPreparation.js";
import {homeworkPrintSnapshot, homeworkPrintDocument} from "../src/utils/homeworkPrint.js";
import {planHomeworkImages} from "../src/utils/homeworkImages.js";
import {fillHomeworkTemplate} from "../src/utils/homeworkTemplates.js";
import {loadCachedScreenFeed, screenFeedCacheKey} from "../src/utils/screenOfflineCache.js";
const item = {id: "a", type: "ASSIGNMENT", status: "PUBLISHED", boardDate: "2026-09-10", title: "准备实验", content: "阅读教材", subject: {name: "物理"},
  targets: [{workspaceId: "class", workspace: {name: "一班"}}], contentJson: {preparation: {text: "圆规\n实验材料 <img>", date: "2026-09-13"}}};

test("preparation dates are strict and expiration follows Beijing midnight without deleting history", () => {
  assert.throws(() => withPreparation(null, "圆规", "2026-02-30"), /日期/);
  assert.throws(() => withPreparation(null, "圆".repeat(501), "2026-09-13"), /500/);
  assert.deepEqual(withPreparation({kind: "NO_HOMEWORK", preparation: {}}, "", ""), {kind: "NO_HOMEWORK"});
  assert.equal(preparationToday(new Date("2026-09-13T15:59:59Z")), "2026-09-13");
  assert.equal(preparationToday(new Date("2026-09-13T16:00:00Z")), "2026-09-14");
  assert.equal(preparationList([item], ["class"], "2026-09-13").length, 1);
  assert.equal(preparationList([item], ["class"], "2026-09-14").length, 0);
  assert.equal(preparationOf(item).text, "圆规\n实验材料 <img>");
  assert.equal(preparationList([item], ["other"], "2026-09-12").length, 0);
  assert.equal(preparationList([{...item, status: "WITHDRAWN"}], ["class"], "2026-09-12").length, 0);
});
test("enriched feed separates earlier homework, prints all materials and safely escapes text", () => {
  const feed = splitPreparationFeed({items: [item], includesPreparations: true}, "2026-09-12");
  assert.equal(feed.items.length, 0);
  assert.equal(feed.preparations.length, 1);
  const snapshot = homeworkPrintSnapshot({publications: feed.items, preparations: feed.preparations, workspaceIds: ["class"], boardDate: "2026-09-12",
    className: "一班", scopeLabel: "一班", now: new Date("2026-09-12T00:00:00Z")});
  const html = homeworkPrintDocument(snapshot);
  assert.match(html, /需带物品/); assert.match(html, /实验材料 &lt;img&gt;/);
  const texts = planHomeworkImages(snapshot, text => text.length * 15).flatMap(page => page.rows.map(row => row.text)).join("\n");
  assert.match(texts, /实验材料 <img>/); assert.match(texts, /2026-09-13/);
});
test("templates fill common materials but cannot inherit a carrying date", () => {
  const result = fillHomeworkTemplate({title: "预习", content: "看书", materials: "〔工具〕", materialsDate: "2000-01-01"}, new Map([["工具", "圆规"]]));
  assert.deepEqual(result, {title: "预习", content: "看书", materials: "圆规", submission: ""});
});

test("older display caches recover already-known preparations without rewriting stored homework", () => {
  const key = screenFeedCacheKey("screen", "2026-09-10");
  const raw = JSON.stringify({savedAt: Date.now(), value: {items: [item]}});
  const values = new Map([[key, raw]]);
  const storage = {getItem: key => values.get(key), removeItem: key => values.delete(key)};
  assert.equal(loadCachedScreenFeed("screen", "2026-09-10", storage).preparations[0].contentJson.preparation.text, "圆规\n实验材料 <img>");
  assert.equal(values.get(key), raw);
});
