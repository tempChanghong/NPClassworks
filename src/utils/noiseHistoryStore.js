export const NOISE_HISTORY_KEY = "noise-slices-v2"
export const NOISE_HISTORY_LIMIT = 5000
export const NOISE_HISTORY_RETENTION_MS = 14 * 86400000

export function createNoiseHistoryStore({
  indexedDB = globalThis.indexedDB,
  storage = localStorage,
  now = Date.now,
  databaseName = "classworks-noise-history",
} = {}) {
  let opening
  const retained = items => items.filter(item => typeof item?.id === "string"
    && Number.isFinite(item.end) && now() - item.end < NOISE_HISTORY_RETENTION_MS)
    .sort((a, b) => a.end - b.end || a.id.localeCompare(b.id)).slice(-NOISE_HISTORY_LIMIT)
  function readLegacy() {
    const raw = storage.getItem(NOISE_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error("噪声历史数据格式无效")
    return retained(parsed)
  }
  function transaction(db, stores, mode, body) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode)
      let result
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(tx.error || new Error("噪声历史存储事务中止"))
      tx.onerror = () => {} // onabort handles request failures as one failed transaction.
      try { body(tx, value => { result = value }) } catch (error) {
        tx.abort(); reject(error)
      }
    })
  }
  function open() {
    if (opening) return opening
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore("slices", {keyPath: "id"}).createIndex("end", "end")
        request.result.createObjectStore("meta")
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => { db.close(); opening = null }
        resolve(db)
      }
    }).then(async db => {
      try {
        await transaction(db, ["slices", "meta"], "readwrite", tx => {
          const meta = tx.objectStore("meta")
          meta.get("legacy-imported").onsuccess = event => {
            if (event.target.result) return
            try {
              for (const item of readLegacy()) tx.objectStore("slices").put(item)
              meta.put(true, "legacy-imported")
            } catch { tx.abort() }
          }
        })
        // Remove only after the import commits. A failed removal cannot cause reimport.
        try { storage.removeItem(NOISE_HISTORY_KEY) } catch { /* Retained legacy copy is harmless. */ }
        return db
      } catch (error) { db.close(); throw error }
    }).catch(error => { opening = null; throw error })
    return opening
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
      await transaction(db, ["slices"], "readwrite", tx => {
        const store = tx.objectStore("slices")
        store.put(slice)
        prune(store)
      })
    },
    async read() {
      if (!indexedDB) return readLegacy()
      const db = await open()
      return transaction(db, ["slices"], "readwrite", (tx, result) => {
        const store = tx.objectStore("slices")
        prune(store)
        store.index("end").getAll().onsuccess = event => result(retained(event.target.result))
      })
    },
    async clear() {
      if (!indexedDB) { storage.removeItem(NOISE_HISTORY_KEY); return }
      const db = await open()
      await transaction(db, ["slices"], "readwrite", tx => tx.objectStore("slices").clear())
    },
    async close() {
      if (opening) (await opening).close()
      opening = null
    },
  }
}
