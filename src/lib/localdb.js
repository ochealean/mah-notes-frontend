// ============================================================
//  IndexedDB local store (the device's offline database).
//
//  Object stores, all keyed by the item's `id` (== uid):
//    notes     : note documents
//    plans     : weekly plans
//    schedules : weekly time blocks (Schedule tab; device-local, not synced)
//    meta      : small key/value rows (syncEnabled, pendingDeletes, lastSync)
//
//  This is the source of truth for the app on a device. The sync
//  engine mirrors notes/plans to/from the backend when an account is
//  connected. Schedules stay local (they drive on-device notifications).
// ============================================================
const DB_NAME = 'mahnotes';
const DB_VERSION = 2;
const STORES = ['notes', 'plans', 'schedules', 'meta'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('plans')) db.createObjectStore('plans', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('schedules')) db.createObjectStore('schedules', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const reqToPromise = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const localdb = {
  async all(store) {
    return tx(store, 'readonly', (os) => reqToPromise(os.getAll()));
  },
  async get(store, id) {
    return tx(store, 'readonly', (os) => reqToPromise(os.get(id)));
  },
  async put(store, item) {
    await tx(store, 'readwrite', (os) => { os.put(item); });
    return item;
  },
  async bulkPut(store, items) {
    await tx(store, 'readwrite', (os) => { items.forEach((it) => os.put(it)); });
  },
  async remove(store, id) {
    await tx(store, 'readwrite', (os) => { os.delete(id); });
  },
  async clear(store) {
    await tx(store, 'readwrite', (os) => { os.clear(); });
  },
  // Replace an entire store's contents in one transaction (used after a sync pull).
  async replaceAll(store, items) {
    await tx(store, 'readwrite', (os) => { os.clear(); items.forEach((it) => os.put(it)); });
  },

  // ── meta key/value helpers ──
  async metaGet(key, fallback = null) {
    const row = await tx('meta', 'readonly', (os) => reqToPromise(os.get(key)));
    return row ? row.value : fallback;
  },
  async metaSet(key, value) {
    await tx('meta', 'readwrite', (os) => { os.put({ key, value }); });
    return value;
  },
};
