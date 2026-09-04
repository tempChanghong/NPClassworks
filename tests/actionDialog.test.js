import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  actionDialogState,
  confirmAction,
  promptAction,
  settleActionDialog,
} from "../src/utils/actionDialog.js";

test("confirmAction resolves the selected action", async () => {
  const pending = confirmAction({title: "停用账号？", color: "warning"});
  assert.equal(actionDialogState.open, true);
  assert.equal(actionDialogState.title, "停用账号？");
  settleActionDialog(true);
  assert.equal(await pending, true);
  assert.equal(actionDialogState.open, false);
});

test("promptAction returns entered text and resets prior options", async () => {
  const pending = promptAction({title: "重置 PIN", value: "1234", secret: true});
  assert.equal(actionDialogState.mode, "prompt");
  assert.equal(actionDialogState.secret, true);
  actionDialogState.value = "5678";
  settleActionDialog(true);
  assert.equal(await pending, "5678");

  const cancelled = confirmAction({title: "继续？"});
  assert.equal(actionDialogState.mode, "confirm");
  assert.equal(actionDialogState.secret, false);
  settleActionDialog(false);
  assert.equal(await cancelled, false);
});

test("interactive application views avoid native blocking dialogs", () => {
  const files = [
    "src/pages/classworks-admin.vue",
    "src/pages/setup.vue",
    "src/pages/settings.vue",
    "src/components/admin/StaffResponsibilityManager.vue",
    "src/components/admin/TeachingRelationshipOverview.vue",
    "src/components/v2/ClassworksHome.vue",
    "src/components/v2/PublicationComposer.vue",
    "src/components/v2/ScreenHomeworkDialog.vue",
    "src/components/v2/ScreenSyncStatus.vue",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /window\.(?:confirm|prompt)\s*\(/, file);
  }
});
