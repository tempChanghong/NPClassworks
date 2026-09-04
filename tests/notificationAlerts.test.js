import test from "node:test";
import assert from "node:assert/strict";
import {
  alertableScreenNotifications,
  claimNotificationAlert,
  createNotificationAlertController,
  findUnseenNotifications,
  notificationAlertKey,
  notificationAcknowledgedStorageKey,
  notificationSeenStorageKey,
  readAcknowledgedNotificationKeys,
  rememberAcknowledgedNotification,
} from "../src/utils/notificationAlerts.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("notification alert identity includes the publication revision", () => {
  assert.equal(notificationAlertKey({id: "notice-a", revision: 3}), "notice-a:3");
});

test("all screen notices can alert regardless of priority", () => {
  const publications = [
    {id: "normal", type: "NOTICE", priority: "NORMAL"},
    {id: "important", type: "NOTICE", priority: "IMPORTANT"},
    {id: "urgent", type: "NOTICE", priority: "URGENT"},
    {id: "homework", type: "ASSIGNMENT", priority: "URGENT"},
  ];
  assert.deepEqual(
    alertableScreenNotifications(publications).map((item) => item.id),
    ["normal", "important", "urgent"],
  );
});

test("seen notifications are remembered per screen and revised notices alert again", () => {
  const storage = memoryStorage();
  const first = {id: "notice-a", revision: 1};
  assert.deepEqual(findUnseenNotifications([first], "screen-a", storage), [first]);
  assert.deepEqual(findUnseenNotifications([first], "screen-a", storage), []);

  const revised = {id: "notice-a", revision: 2};
  assert.deepEqual(findUnseenNotifications([revised], "screen-a", storage), [revised]);
  assert.deepEqual(findUnseenNotifications([first], "screen-b", storage), [first]);
  assert.ok(storage.getItem(notificationSeenStorageKey("screen-a")));
});

test("an alert claim suppresses duplicate tabs during the lease", () => {
  const storage = memoryStorage();
  assert.equal(claimNotificationAlert("screen-a", "notice-a:1", storage, 1_000), true);
  assert.equal(claimNotificationAlert("screen-a", "notice-a:1", storage, 2_000), false);
  assert.equal(claimNotificationAlert("screen-a", "notice-a:1", storage, 32_000), true);
});

test("a local screen acknowledgement survives reload for later delivery", () => {
  const storage = memoryStorage();
  const notice = {id: "notice-a", revision: 4};
  rememberAcknowledgedNotification(notice, "screen-a", storage);
  assert.equal(readAcknowledgedNotificationKeys("screen-a", storage).has("notice-a:4"), true);
  assert.ok(storage.getItem(notificationAcknowledgedStorageKey("screen-a")));
  assert.equal(readAcknowledgedNotificationKeys("screen-b", storage).size, 0);
});

test("background alerts keep application audio and add a system notification", async () => {
  const storage = memoryStorage();
  const played = [];
  const systemNotifications = [];
  class FakeNotification {
    static permission = "granted";
    constructor(title, options) {
      systemNotifications.push({title, options});
    }
    close() {}
  }
  const controller = createNotificationAlertController({
    scopeId: "screen-a",
    storage,
    documentRef: {hidden: true, hasFocus: () => false},
    navigatorRef: {},
    NotificationApi: FakeNotification,
    play: (filename) => played.push(filename),
  });

  await controller.alert([{id: "urgent-a", revision: 1, title: "停课通知", content: "请留在教室"}], {
    soundEnabled: true,
    soundFile: "urgent.mp3",
    systemNotificationEnabled: true,
  });

  assert.deepEqual(played, ["urgent.mp3"]);
  assert.equal(systemNotifications.length, 1);
  assert.equal(systemNotifications[0].title, "停课通知");
});

test("foreground alerts play audio without creating a system notification", async () => {
  const played = [];
  class FakeNotification {
    static permission = "granted";
    constructor() {
      throw new Error("foreground notification should not be created");
    }
  }
  const controller = createNotificationAlertController({
    scopeId: "screen-a",
    storage: memoryStorage(),
    documentRef: {hidden: false, hasFocus: () => true},
    navigatorRef: {},
    NotificationApi: FakeNotification,
    play: (filename) => played.push(filename),
  });

  await controller.alert([{id: "urgent-b", revision: 1}], {soundFile: "urgent.mp3"});
  assert.deepEqual(played, ["urgent.mp3"]);
});
