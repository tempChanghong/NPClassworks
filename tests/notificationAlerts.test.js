import test from "node:test";
import assert from "node:assert/strict";
import {
  alertableScreenNotifications,
  claimNotificationAlert,
  pruneExpiredNotificationClaims,
  createNotificationAlertController,
  findUnseenNotifications,
  notificationAlertKey,
  notificationAcknowledgedStorageKey,
  notificationSeenStorageKey,
  readAcknowledgedNotificationKeys,
  rememberAcknowledgedNotification,
  screenNotificationSoundProfile,
  screenNotificationPopupEnabled,
  selectNotificationForAlert,
} from "../src/utils/notificationAlerts.js";

test("only minor notices can opt out of screen popups, and their sound is Teams default", () => {
  for (const priority of ["NORMAL", "IMPORTANT", "URGENT"]) {
    assert.equal(screenNotificationPopupEnabled({type: "NOTICE", priority, contentJson: {popupEnabled: false}}), true);
  }
  assert.equal(screenNotificationPopupEnabled({type: "NOTICE", priority: "MINOR"}), false);
  assert.equal(screenNotificationPopupEnabled({type: "NOTICE", priority: "MINOR", contentJson: {popupEnabled: false}}), false);
  assert.equal(screenNotificationPopupEnabled({type: "NOTICE", priority: "MINOR", contentJson: {popupEnabled: true}}), true);
  assert.equal(screenNotificationPopupEnabled({type: "ASSIGNMENT", priority: "URGENT"}), false);
  assert.equal(screenNotificationSoundProfile({priority: "MINOR"}, {singleSound: "custom.mp3"}).filename, "Teams 默认.mp3");
});

test("minor notice opting out still sounds but does not create a background system popup", async () => {
  const played = [], notifications = [];
  class NotificationApi {
    static permission = "granted";
    constructor(title) { notifications.push(title); }
  }
  const controller = createNotificationAlertController({scopeId: "minor", storage: memoryStorage(),
    documentRef: {hidden: true}, navigatorRef: {}, NotificationApi, play: filename => played.push(filename)});
  await controller.alert([{id: "minor", revision: 1, type: "NOTICE", priority: "MINOR", contentJson: {popupEnabled: false}}], {soundProfile: screenNotificationSoundProfile});
  assert.deepEqual(played, ["Teams 默认.mp3"]);
  assert.deepEqual(notifications, []);
  await controller.alert([{id: "minor", revision: 2, type: "NOTICE", priority: "MINOR", contentJson: {popupEnabled: true}}], {soundProfile: screenNotificationSoundProfile});
  assert.deepEqual(notifications, ["NPClassworks 次要通知"]);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    get length() { return values.size; },
  };
}

test("more than 100 active notices retain acknowledgements and do not alert again after reload", async () => {
  const storage = memoryStorage();
  const notices = Array.from({length: 150}, (_, i) => ({id: `notice-${i}`, revision: 1, type: "NOTICE",
    expiresAt: new Date(Date.now() + 86400000).toISOString()}));
  for (const notice of notices) rememberAcknowledgedNotification(notice, "screen-a", storage);
  assert.equal(readAcknowledgedNotificationKeys("screen-a", storage).size, 150);
  assert.equal(readAcknowledgedNotificationKeys("screen-b", storage).size, 0);
  assert.equal(JSON.parse(storage.getItem(notificationAcknowledgedStorageKey("screen-a"))).every(key => typeof key === "string"), true);
  const played = [];
  const controller = () => createNotificationAlertController({scopeId: "screen-a", storage, navigatorRef: {},
    documentRef: {hidden: false}, play: () => played.push("sound")});
  await controller().alert(notices);
  await controller().alert(notices);
  assert.equal(played.length, 1);
  const revised = {...notices[0], revision: 2};
  assert.deepEqual(findUnseenNotifications([revised], "screen-a", storage), [revised]);
  assert.equal(readAcknowledgedNotificationKeys("screen-a", storage).has(notificationAlertKey(revised)), false);
});

test("known expiry cleans only expired records while legacy and indefinite records remain", t => {
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  const storage = memoryStorage();
  const ackKey = notificationAcknowledgedStorageKey("screen-a");
  const seenKey = notificationSeenStorageKey("screen-a");
  for (const key of [ackKey, seenKey]) storage.setItem(key, JSON.stringify(["legacy:1", "unknown:1"]));
  const legacy = {id: "legacy", revision: 1, expiresAt: new Date(now + 1000).toISOString()};
  const active = {id: "active", revision: 1, expiresAt: new Date(now + 10000).toISOString()};
  readAcknowledgedNotificationKeys("screen-a", storage, [legacy]);
  rememberAcknowledgedNotification(active, "screen-a", storage);
  findUnseenNotifications([legacy, active], "screen-a", storage);
  t.mock.method(Date, "now", () => now + 1000);
  assert.deepEqual([...readAcknowledgedNotificationKeys("screen-a", storage)], ["unknown:1", "active:1"]);
  assert.deepEqual(findUnseenNotifications([active], "screen-a", storage), []);
  assert.deepEqual(JSON.parse(storage.getItem(seenKey)), ["unknown:1", "active:1"]);
  assert.equal(Object.hasOwn(JSON.parse(storage.getItem(`${ackKey}:expires`)), "legacy:1"), false);
  storage.setItem(`${ackKey}:expires`, "invalid-json");
  assert.equal(readAcknowledgedNotificationKeys("screen-a", storage).has("active:1"), true);
});

test("a failed acknowledgement read never overwrites the previously stored confirmation set", () => {
  const storage = memoryStorage();
  const key = notificationAcknowledgedStorageKey("screen-a");
  storage.setItem(key, '["existing:1"]');
  const read = storage.getItem;
  storage.getItem = name => { if (name === key) throw new Error("storage unavailable"); return read(name); };
  rememberAcknowledgedNotification({id: "new", revision: 1}, "screen-a", storage);
  readAcknowledgedNotificationKeys("screen-a", storage);
  assert.equal(read(key), '["existing:1"]');
});

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

test("only urgent notices use the alarm sound profile", () => {
  const sounds = {singleSound: "gentle.mp3", urgentSound: "alarm.mp3"};
  assert.deepEqual(screenNotificationSoundProfile({priority: "NORMAL"}, sounds), {
    filename: "gentle.mp3",
    gainValue: 1.2,
  });
  assert.deepEqual(screenNotificationSoundProfile({priority: "IMPORTANT"}, sounds), {
    filename: "gentle.mp3",
    gainValue: 1.2,
  });
  assert.deepEqual(screenNotificationSoundProfile({priority: "URGENT"}, sounds), {
    filename: "alarm.mp3",
    gainValue: 1.5,
  });
});

test("the default ordinary notification uses the louder bubble sound", () => {
  assert.equal(
    screenNotificationSoundProfile({priority: "NORMAL"}).filename,
    "Teams 气泡(大声).mp3",
  );
});

test("a simultaneous urgent notice takes precedence over ordinary notices", () => {
  assert.equal(selectNotificationForAlert([
    {id: "normal", priority: "NORMAL"},
    {id: "urgent", priority: "URGENT"},
    {id: "important", priority: "IMPORTANT"},
  ]).id, "urgent");
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

test("claim cleanup retains active leases, other scopes and all receipt/confirmation data", async () => {
  const storage = memoryStorage();
  const prefix = "classworks-v2-notification-alert-claim:screen-a:";
  claimNotificationAlert("screen-a", "expired:1", storage, 1);
  claimNotificationAlert("screen-a", "active:1", storage, 40_000);
  claimNotificationAlert("screen-b", "expired:1", storage, 1);
  storage.setItem(`${prefix}malformed`, "broken");
  storage.setItem(notificationAcknowledgedStorageKey("screen-a"), '["expired:1"]');
  storage.setItem("classworks-v2-notification-delivery:api:screen-a:1:staged:test", "pending receipt");
  const before = Array.from({length: storage.length}, (_, i) => storage.key(i));
  const navigatorRef = {locks: {request: async (name, options, callback) => callback({name})}};
  assert.equal(await pruneExpiredNotificationClaims("screen-a", storage, navigatorRef, 50_000), 1);
  assert.equal(storage.getItem(`${prefix}expired:1`), null);
  for (const key of before.filter(key => key !== `${prefix}expired:1`)) assert.notEqual(storage.getItem(key), null);
});

test("claim cleanup skips held locks and rechecks a renewed lease after acquiring the writer lock", async () => {
  const storage = memoryStorage();
  claimNotificationAlert("screen-a", "held:1", storage, 1);
  claimNotificationAlert("screen-a", "renewed:1", storage, 1);
  const navigatorRef = {locks: {request: async (name, options, callback) => {
    assert.equal(options.ifAvailable, true);
    if (name.endsWith("held:1")) return callback(null);
    claimNotificationAlert("screen-a", "renewed:1", storage, 50_000);
    return callback({name});
  }}};
  assert.equal(await pruneExpiredNotificationClaims("screen-a", storage, navigatorRef, 50_000), 0);
  assert.equal(storage.length, 2);
  assert.equal(await pruneExpiredNotificationClaims("screen-a", storage, {}, 100_000), 0);
  const broken = {...storage, key: () => { throw new Error("Storage unavailable"); }};
  assert.equal(await pruneExpiredNotificationClaims("screen-a", broken, navigatorRef, 100_000), 0);
});

test("cleanup is throttled to five minutes and makes progress across batches of old claims", async () => {
  const storage = memoryStorage();
  for (let i = 0; i < 205; i++) claimNotificationAlert("screen-a", `old-${i}:1`, storage, 1);
  let clock = 50_000;
  const navigatorRef = {locks: {request: async (name, options, callback) => callback({name})}};
  const controller = createNotificationAlertController({scopeId: "screen-a", storage, navigatorRef, now: () => clock, play: () => {}});
  const notices = [{id: "current", revision: 1}];
  await controller.alert(notices);
  const remaining = () => Array.from({length: storage.length}, (_, i) => storage.key(i)).filter(key => key.includes(":old-")).length;
  assert.equal(remaining(), 5);
  clock += 1000;
  await controller.alert(notices);
  assert.equal(remaining(), 5);
  clock += 300_000;
  await controller.alert(notices);
  assert.equal(remaining(), 0);
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
