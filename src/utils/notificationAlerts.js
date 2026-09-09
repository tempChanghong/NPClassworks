import {defaultSingleSound, defaultUrgentSound} from "./soundList.js";
import {publicationPriorityMeta} from "./publicationStatus.js";
import {
  GENTLE_NOTIFICATION_GAIN,
  playProminentNotificationSound,
  PROMINENT_NOTIFICATION_GAIN,
} from "./prominentNotificationSound.js";

const CLAIM_TTL_MS = 30_000;

export function notificationAlertKey(notice) {
  return `${notice?.id || "unknown"}:${notice?.revision || 0}`;
}

export function alertableScreenNotifications(publications = []) {
  return publications.filter((publication) => publication?.type === "NOTICE");
}

export function screenNotificationPopupEnabled(notice) {
  return notice?.type === "NOTICE"
    && (notice.priority !== "MINOR" || notice.contentJson?.popupEnabled === true);
}

export function screenNotificationSoundProfile(notice, {
  singleSound = defaultSingleSound,
  urgentSound = defaultUrgentSound,
} = {}) {
  if (notice?.priority === "MINOR") {
    return {filename: "Teams 默认.mp3", gainValue: GENTLE_NOTIFICATION_GAIN};
  }
  return notice?.priority === "URGENT"
    ? {filename: urgentSound, gainValue: PROMINENT_NOTIFICATION_GAIN}
    : {filename: singleSound, gainValue: GENTLE_NOTIFICATION_GAIN};
}

export function selectNotificationForAlert(notices = []) {
  const rank = {URGENT: 3, IMPORTANT: 2, NORMAL: 1, MINOR: 0};
  return notices.reduce((selected, notice) => (
    !selected || (rank[notice?.priority] || 0) > (rank[selected?.priority] || 0)
      ? notice
      : selected
  ), null);
}

export function notificationSeenStorageKey(scopeId) {
  return `classworks-v2-notification-alerts-seen:${scopeId || "unbound"}`;
}

export function notificationAcknowledgedStorageKey(scopeId) {
  return `classworks-v2-notification-acknowledged:${scopeId || "unbound"}`;
}

export function readAcknowledgedNotificationKeys(scopeId, storage = localStorage, notices = []) {
  return notificationMemory(storage, notificationAcknowledgedStorageKey(scopeId), notices).keys;
}

export function rememberAcknowledgedNotification(notice, scopeId, storage = localStorage) {
  return notificationMemory(storage, notificationAcknowledgedStorageKey(scopeId), [notice], true).keys;
}

function notificationMemory(storage, storageKey, notices, remember = false) {
  // Keep the existing string-array format readable by earlier clients. Expiry
  // metadata is separate; missing/legacy metadata never causes eviction.
  let saved = [], writable = true;
  try {
    saved = JSON.parse(storage.getItem(storageKey) || "[]");
    if (!Array.isArray(saved) || !saved.every(key => typeof key === "string")) {
      saved = []; writable = false;
    }
  } catch { writable = false; }
  const keys = new Set(saved);
  const expiryKey = `${storageKey}:expires`;
  let expiries, rawExpiry;
  try { rawExpiry = storage.getItem(expiryKey); } catch { writable = false; }
  try { expiries = JSON.parse(rawExpiry); } catch { /* Unknown lifetimes retain keys. */ }
  const known = new Map(expiries && typeof expiries === "object" && !Array.isArray(expiries)
    ? Object.entries(expiries).filter(([, time]) => Number.isFinite(time)) : []);
  const unseen = notices.filter(notice => !keys.has(notificationAlertKey(notice)));
  for (const notice of notices) {
    const key = notificationAlertKey(notice);
    if (remember) keys.add(key);
    if (!keys.has(key)) continue;
    const expiresAt = notice.expiresAt ? new Date(notice.expiresAt).getTime() : NaN;
    if (Number.isFinite(expiresAt)) known.set(key, expiresAt);
    else known.delete(key);
  }
  const now = Date.now();
  for (const [key, time] of known) {
    if (time <= now) keys.delete(key);
    if (!keys.has(key)) known.delete(key);
  }
  try {
    if (!writable) return {keys, unseen};
    // Metadata first: a failed write must not invent a lifetime for saved keys.
    const metadata = JSON.stringify(Object.fromEntries(known));
    if (storage.getItem(expiryKey) !== metadata) storage.setItem(expiryKey, metadata);
    const encoded = JSON.stringify([...keys]);
    if (storage.getItem(storageKey) !== encoded) storage.setItem(storageKey, encoded);
  } catch { /* The server receipt still works when local storage is unavailable. */ }
  return {keys, unseen};
}

export function findUnseenNotifications(notices, scopeId, storage = localStorage) {
  return notificationMemory(storage, notificationSeenStorageKey(scopeId), notices, true).unseen;
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
  const label = publicationPriorityMeta(notice.priority).label;
  const notification = new NotificationApi(notice.title || `NPClassworks ${label}通知`, {
    body: notice.content || `收到一条新的${label}通知`,
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
  play = (filename, options) => playProminentNotificationSound(filename, options),
} = {}) {
  async function alert(notices, {
    soundEnabled = true,
    soundFile = defaultUrgentSound,
    soundProfile = null,
    systemNotificationEnabled = true,
  } = {}) {
    if (!storage || !Array.isArray(notices) || !notices.length) return false;
    const unseen = findUnseenNotifications(notices, scopeId, storage);
    if (!unseen.length) return false;

    // A feed refresh can introduce several notices together. Alert once and show
    // the newest/current notice instead of producing a burst of overlapping audio.
    const notice = selectNotificationForAlert(unseen);
    const key = notificationAlertKey(notice);
    return withBrowserAlertLock(scopeId, key, () => {
      if (!claimNotificationAlert(scopeId, key, storage)) return false;
      if (soundEnabled) {
        const profile = typeof soundProfile === "function"
          ? soundProfile(notice)
          : {filename: soundFile};
        play(profile?.filename || soundFile, {gainValue: profile?.gainValue});
      }
      if (systemNotificationEnabled && pageIsBackgrounded(documentRef)
        && (notice.priority !== "MINOR" || notice.contentJson?.popupEnabled === true)) {
        showSystemNotification(notice, NotificationApi, windowRef);
      }
      return true;
    }, navigatorRef);
  }

  return {alert};
}
