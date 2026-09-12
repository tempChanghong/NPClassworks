export const NOISE_HISTORY_KEY = "noise-slices-v2"
export const NOISE_HISTORY_LIMIT = 5000
export const NOISE_HISTORY_RETENTION_MS = 14 * 86400000

export function createNoiseHistoryStore({
  indexedDB = globalThis.indexedDB,
  storage = localStorage,
  now = Date.now,
  databaseName = "classworks-noise-history",
  operationTimeoutMs = 10000,
} = {}) {
  let opening
  let importedSource
  const retained = items => items.filter(item => typeof item?.id === "string"
    && Number.isFinite(item.end) && now() - item.end < NOISE_HISTORY_RETENTION_MS)
    .sort((a, b) => a.end - b.end || a.id.localeCompare(b.id)).slice(-NOISE_HISTORY_LIMIT)
  function readLegacy(raw = storage.getItem(NOISE_HISTORY_KEY)) {
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error("噪声历史数据格式无效")
    return retained(parsed)
  }
  function transaction(db, stores, mode, body) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode)
      let result, settled = false
      const finish = error => {
        if (settled) return
        settled = true; clearTimeout(timer)
        if (error) reject(error); else resolve(result)
      }
      const timer = setTimeout(() => {
        // Abort the actual transaction: merely racing its Promise could allow a
        // timed-out write to commit after a subsequent clear.
        finish(new Error("噪声历史存储超时，请重试"))
        try { tx.abort() } catch { /* Already completed or aborted. */ }
        if (opening?.db === db) { db.close(); opening = null; importedSource = undefined }
      }, operationTimeoutMs)
      tx.oncomplete = () => finish()
      tx.onabort = () => finish(tx.error || new Error("噪声历史存储事务中止"))
      tx.onerror = () => {} // onabort handles request failures as one failed transaction.
      try { body(tx, value => { result = value }) } catch (error) {
        try { tx.abort() } catch { /* Preserve the original error. */ }
        finish(error)
      }
    })
  }
  function open() {
    if (opening) return opening.promise
    const attempt = {db: null, abandoned: false}
    opening = attempt
    attempt.promise = new Promise((resolve, reject) => {
      const fail = error => {
        if (attempt.abandoned) return
        attempt.abandoned = true; clearTimeout(timer)
        if (opening === attempt) { opening = null; importedSource = undefined }
        reject(error)
      }
      attempt.cancel = () => fail(new Error("噪声历史存储已关闭，请重试"))
      const timer = setTimeout(() => fail(new Error("噪声历史存储打开超时，请重试")), operationTimeoutMs)
      let request
      try { request = indexedDB.open(databaseName, 1) } catch (error) { fail(error); return }
      request.onupgradeneeded = () => {
        if (attempt.abandoned) { request.transaction.abort(); return }
        request.result.createObjectStore("slices", {keyPath: "id"}).createIndex("end", "end")
        request.result.createObjectStore("meta")
      }
      request.onerror = () => fail(request.error)
      request.onblocked = () => fail(new Error("噪声历史存储被其他页面占用，请关闭其他页面后重试"))
      request.onsuccess = () => {
        const db = request.result
        if (attempt.abandoned) { db.close(); return }
        clearTimeout(timer); attempt.db = db
        db.onversionchange = () => {
          db.close()
          if (opening === attempt) { opening = null; importedSource = undefined }
        }
        resolve(db)
      }
    })
    return attempt.promise
  }
  async function importLegacy(db) {
    const source = storage.getItem(NOISE_HISTORY_KEY)
    if (source === importedSource) return
    await transaction(db, ["slices", "meta"], "readwrite", tx => {
      const meta = tx.objectStore("meta")
      meta.get("legacy-clear").onsuccess = event => {
        const cleared = event.target.result || {through: -Infinity, ids: []}
        const removed = new Set(cleared.ids)
        try {
          const items = source && source === cleared.ignoredSource ? [] : readLegacy(source)
          for (const item of items) {
            if (item.end > cleared.through && !removed.has(item.id)) tx.objectStore("slices").put(item)
          }
          meta.put(true, "legacy-imported")
          prune(tx.objectStore("slices"))
        } catch { tx.abort() }
      }
    })
    if (opening?.db === db) importedSource = source
    // Keep the bounded legacy source: another old page can write it between an
    // IndexedDB commit and removeItem. Cross-storage deletion cannot be atomic.
  }
  function prune(store) {
    const cutoff = now() - NOISE_HISTORY_RETENTION_MS
    // Visit only expired records, then delete just the capacity excess.
    store.index("end").openCursor().onsuccess = event => {
      const cursor = event.target.result
      if (cursor && cursor.key <= cutoff) { cursor.delete(); cursor.continue(); return }
      store.count().onsuccess = event => {
        let excess = event.target.result - NOISE_HISTORY_LIMIT
        if (excess <= 0) return
        store.index("end").openCursor().onsuccess = event => {
          const oldest = event.target.result
          if (!oldest || excess-- <= 0) return
          oldest.delete()
          if (excess > 0) oldest.continue()
        }
      }
    }
  }
  return {
    async append(slice) {
      if (!retained([slice]).length) return
      if (!indexedDB) {
        storage.setItem(NOISE_HISTORY_KEY, JSON.stringify(retained([...readLegacy().filter(item => item.id !== slice.id), slice])))
        return
      }
      const db = await open()
      await importLegacy(db)
      await transaction(db, ["slices"], "readwrite", tx => {
        const store = tx.objectStore("slices")
        store.put(slice)
        prune(store)
      })
    },
    async read() {
      if (!indexedDB) return readLegacy()
      const db = await open()
      await importLegacy(db)
      return transaction(db, ["slices"], "readwrite", (tx, result) => {
        const store = tx.objectStore("slices")
        prune(store)
        store.index("end").getAll().onsuccess = event => result(retained(event.target.result))
      })
    },
    async clear() {
      if (!indexedDB) { storage.removeItem(NOISE_HISTORY_KEY); return }
      const db = await open()
      const source = storage.getItem(NOISE_HISTORY_KEY)
      // A user can clear even a malformed old source. Timestamp + known IDs also
      // block a stale old page from writing cleared records back after the clear.
      let legacyIds = []
      let ignoredSource = null
      try { legacyIds = readLegacy(source).map(item => item.id) } catch { ignoredSource = source }
      await transaction(db, ["slices", "meta"], "readwrite", tx => {
        const slices = tx.objectStore("slices")
        slices.getAllKeys().onsuccess = event => {
          tx.objectStore("meta").put({through: now(), ids: [...new Set([...event.target.result, ...legacyIds])], ignoredSource}, "legacy-clear")
          slices.clear()
        }
      })
      if (opening?.db === db) importedSource = source
    },
    async close() {
      if (opening?.db) opening.db.close()
      else opening?.cancel()
      opening = null
      importedSource = undefined
    },
  }
}
