/**
 * API keys live in IndexedDB of the extension origin. Content scripts run in the page origin and
 * cannot read it (unlike chrome.storage.local). This is not server-grade secret protection:
 * anyone with access to the browser profile can still read it.
 */
const DB = 'aib-secrets';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export const getApiKey = (provider: string) => tx<string | undefined>('readonly', (s) => s.get('key:' + provider));
export const setApiKey = (provider: string, key: string) =>
  key ? tx('readwrite', (s) => s.put(key, 'key:' + provider)) : tx('readwrite', (s) => s.delete('key:' + provider));
