import {playSound} from "./soundList.js";

const MAX_SEEN_ALERTS = 100;
const CLAIM_TTL_MS = 30_000;

export function notificationAlertKey(notice) {
  return `${notice?.id || "unknown"}:${notice?.revision || 0}`;
}

export function notificationSeenStorageKey(scopeId) {
  return `classworks-v2-notification-alerts-seen:${scopeId || "unbound"}`;
}

export function notificationAcknowledgedStorageKey(scopeId) {
  return `classworks-v2-notification-acknowledged:${scopeId || "unbound"}`;
}

export function readAcknowledgedNotificationKeys(scopeId, storage = localStorage) {
  return new Set(readJsonArray(storage, notificationAcknowledgedStorageKey(scopeId)));
}

export function rememberAcknowledgedNotification(notice, scopeId, storage = localStorage) {
  const keys = readAcknowledgedNotificationKeys(scopeId, storage);
  keys.add(notificationAlertKey(notice));
  try {
    storage.setItem(notificationAcknowledgedStorageKey(scopeId), JSON.stringify([...keys].slice(-MAX_SEEN_ALERTS)));
  } catch {
    // The server receipt can still be sent when local storage is unavailable.
  }
  return keys;
}

function readJsonArray(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function findUnseenNotifications(notices, scopeId, storage = localStorage) {
  const storageKey = notificationSeenStorageKey(scopeId);
  const seen = new Set(readJsonArray(storage, storageKey));
  const unseen = notices.filter((notice) => !seen.has(notificationAlertKey(notice)));
  notices.forEach((notice) => seen.add(notificationAlertKey(notice)));
  try {
    storage.setItem(storageKey, JSON.stringify([...seen].slice(-MAX_SEEN_ALERTS)));
  } catch {
    // Storage can be unavailable in private or restricted browser profiles.
  }
  return unseen;
}

function claimStorageKey(scopeId, alertKey) {
  return `classworks-v2-notification-alert-claim:${scopeId || "unbound"}:${alertKey}`;
}

export function claimNotificationAlert(scopeId, alertKey, storage = localStorage, now = Date.now()) {
  const key = claimStorageKey(scopeId, alertKey);
  try {
    const existing = JSON.parse(storage.getItem(key));
    if (existing?.claimedAt && now - existing.claimedAt < CLAIM_TTL_MS) return false;
    storage.setItem(key, JSON.stringify({claimedAt: now}));
    return true;
  } catch {
    return true;
  }
}

function pageIsBackgrounded(documentRef) {
  return Boolean(documentRef?.hidden || (documentRef?.hasFocus && !documentRef.hasFocus()));
}

export function showSystemNotification(notice, NotificationApi = globalThis.Notification, windowRef = globalThis.window) {
  if (!NotificationApi || NotificationApi.permission !== "granted") return null;
  const notification = new NotificationApi(notice.title || "Classworks 紧急通知", {
    body: notice.content || "收到一条新的紧急通知",
    icon: "/pwa/image/pwa-192x192.png",
    badge: "/pwa/image/pwa-64x64.png",
    tag: `classworks-notice-${notificationAlertKey(notice)}`,
    renotify: true,
    requireInteraction: true,
  });
  notification.onclick = () => {
    windowRef?.focus?.();
    notification.close();
  };
  return notification;
}

async function withBrowserAlertLock(scopeId, alertKey, callback, navigatorRef) {
  if (!navigatorRef?.locks?.request) return callback();
  return navigatorRef.locks.request(
    `classworks-notification-alert:${scopeId}:${alertKey}`,
    {mode: "exclusive", ifAvailable: true},
    (lock) => lock ? callback() : false,
  );
}

export function createNotificationAlertController({
  scopeId,
  storage = globalThis.localStorage,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  NotificationApi = globalThis.Notification,
  play = (filename) => playSound(filename),
} = {}) {
  async function alert(notices, {
    soundEnabled = true,
    soundFile = "Teams 默认通话铃.mp3",
    systemNotificationEnabled = true,
  } = {}) {
    if (!storage || !Array.isArray(notices) || !notices.length) return false;
    const unseen = findUnseenNotifications(notices, scopeId, storage);
    if (!unseen.length) return false;

    // A feed refresh can introduce several notices together. Alert once and show
    // the newest/current notice instead of producing a burst of overlapping audio.
    const notice = unseen[0];
    const key = notificationAlertKey(notice);
    return withBrowserAlertLock(scopeId, key, () => {
      if (!claimNotificationAlert(scopeId, key, storage)) return false;
      if (soundEnabled) play(soundFile);
      if (systemNotificationEnabled && pageIsBackgrounded(documentRef)) {
        showSystemNotification(notice, NotificationApi, windowRef);
      }
      return true;
    }, navigatorRef);
  }

  return {alert};
}
