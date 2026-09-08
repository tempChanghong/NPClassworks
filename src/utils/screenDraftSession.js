import {withBrowserStorageLock} from "./browserStorageLock.js";
import {screenHomeworkDraftKey} from "./screenHomeworkDraft.js";

const TAB_KEY = "classworks-v2-draft-tab";
const LEASE_PREFIX = "classworks-draft-tab:";
const MAX_AGE = 7 * 86400000;
let tabPromise;

// sessionStorage survives reload but is copied when duplicating a tab. An
// exclusive document-lifetime lease detects that copy before it can share keys.
function draftTabId() {
  if (tabPromise) return tabPromise.then(id => { sessionStorage.setItem(TAB_KEY, id); return id; });
  tabPromise = new Promise((resolve, reject) => {
    const claim = id => {
      const locks = globalThis.navigator?.locks;
      if (!locks?.request) return reject(new Error("当前浏览器不支持安全的草稿隔离，请更新浏览器后重试。"));
      locks.request(LEASE_PREFIX + id, {ifAvailable: true}, async lock => {
        if (!lock) { claim(globalThis.crypto.randomUUID()); return; }
        sessionStorage.setItem(TAB_KEY, id);
        resolve(id);
        // The browser releases this lease when this document is destroyed.
        await new Promise(() => {});
      }).catch(reject);
    };
    claim(sessionStorage.getItem(TAB_KEY) || globalThis.crypto.randomUUID());
  }).catch(error => { tabPromise = null; throw error; });
  return tabPromise;
}

export async function openScreenDraftStorage(bindingId, publicationId) {
  const id = await draftTabId();
  const storage = globalThis.localStorage;
  const base = screenHomeworkDraftKey(bindingId, publicationId);
  const prefix = `${base}:tab:`;
  const owned = prefix + id;
  await withBrowserStorageLock(`classworks-draft-migration:${base}`, async () => {
    if (storage.getItem(owned) !== null) return;
    const legacy = storage.getItem(base);
    if (legacy !== null) {
      // Copy before deleting. An unavailable store must never discard the source.
      JSON.parse(legacy);
      storage.setItem(owned, legacy);
      storage.removeItem(base);
      return;
    }
    // Reopen a closed tab's draft after a browser restart, without taking a
    // live tab's input. Retain other abandoned drafts until their seven-day TTL.
    const candidates = Array.from({length: storage.length}, (_, i) => storage.key(i))
      .filter(key => key?.startsWith(prefix) && key !== owned)
      .map(key => ({key, raw: storage.getItem(key)}))
      .map(item => ({...item, updatedAt: Number(JSON.parse(item.raw)?.updatedAt) || 0}))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    let restored = false;
    for (const candidate of candidates) {
      await navigator.locks.request(LEASE_PREFIX + candidate.key.slice(prefix.length), {ifAvailable: true}, lock => {
        if (!lock) return;
        // The owner may have saved again and closed after candidate discovery.
        // Reread only after taking its lease, before moving or expiring anything.
        const raw = storage.getItem(candidate.key);
        if (raw === null) return;
        const updatedAt = Number(JSON.parse(raw)?.updatedAt) || 0;
        if (Date.now() - updatedAt > MAX_AGE) { storage.removeItem(candidate.key); return; }
        if (restored) return;
        storage.setItem(owned, raw);
        storage.removeItem(candidate.key);
        restored = true;
      });
    }
  });
  return {
    getItem: () => storage.getItem(owned),
    setItem: (_key, value) => storage.setItem(owned, value),
    removeItem: () => storage.removeItem(owned),
  };
}
