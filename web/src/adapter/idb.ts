/**
 * idb.ts - a tiny promise-based IndexedDB key/value store.
 *
 * The web adapter persists everything the desktop app keeps in userData -
 * settings, the recent-files list, crash-recovery backups, and (opaquely)
 * File System Access handles - into a single IndexedDB database with one object
 * store per concern. Dependency-free on purpose: no idb-keyval, no bundle cost.
 */

const DB_NAME = 'lekha-web'
const DB_VERSION = 1

/** Object stores. `handles` holds live FileSystemHandle objects (structured-clonable). */
const STORES = ['settings', 'recent', 'backups', 'handles'] as const
export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
  return dbPromise
}

function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (os: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
      }),
  )
}

export function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (os) => os.get(key) as IDBRequest<T | undefined>)
}

export function idbSet(store: StoreName, key: string, value: unknown): Promise<IDBValidKey> {
  return tx<IDBValidKey>(store, 'readwrite', (os) => os.put(value, key))
}

export function idbDelete(store: StoreName, key: string): Promise<undefined> {
  return tx<undefined>(store, 'readwrite', (os) => os.delete(key))
}

export function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (os) => os.getAll() as IDBRequest<T[]>)
}
