/**
 * Antrean kiriman yang tertunda karena koneksi putus (F2): tebakan nilai (JOL) dan foto catatan satu sesi.
 * Disimpan di IndexedDB supaya tidak hilang saat tab ditutup, lalu dikirim saat koneksi kembali.
 *
 * Tidak ada token di sini; kiriman tetap memakai cookie sesi saat dikirim. Foto disimpan sebagai ArrayBuffer
 * (bukan Blob) karena Safari dulu gagal menyimpan Blob di IndexedDB mode privat. Antrean dihapus saat keluar
 * dari akun (komputer bersama), dan kiriman yang terlalu lama dibuang saat antrean dikirim.
 */
type ItemBase = { id: string; userId: string; sessionId: string; savedAt: number };
export type JolItem = ItemBase & { kind: 'jol'; score: number };
export type PhotoItem = ItemBase & { kind: 'photo'; bytes: ArrayBuffer; name: string; type: string };
export type OutboxItem = JolItem | PhotoItem;

export interface OutboxStore {
  put(item: OutboxItem): Promise<void>;
  list(): Promise<OutboxItem[]>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** Satu tebakan dan satu foto per sesi: kiriman baru menggantikan yang lama. */
export const outboxId = (kind: OutboxItem['kind'], sessionId: string) => `${kind}:${sessionId}`;

export function createMemoryOutbox(): OutboxStore {
  const items = new Map<string, OutboxItem>();
  return {
    put: async (item) => void items.set(item.id, item),
    list: async () => [...items.values()],
    remove: async (id) => void items.delete(id),
    clear: async () => items.clear(),
  };
}

const STORE = 'outbox';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createIdbOutbox(dbName = 'reksa-offline'): OutboxStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => {
    db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err: unknown) => {
      db = null;
      throw err;
    });
    return db;
  };
  const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const tx = (await open()).transaction(STORE, mode);
    const result = request(fn(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  };
  return {
    put: async (item) => void (await withStore('readwrite', (s) => s.put(item))),
    list: () => withStore('readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>),
    remove: async (id) => void (await withStore('readwrite', (s) => s.delete(id))),
    clear: async () => void (await withStore('readwrite', (s) => s.clear())),
  };
}

/** Tanpa IndexedDB (browser lama atau diblokir), antrean hanya bertahan selama tab terbuka. */
export const outbox: OutboxStore = typeof indexedDB === 'undefined' ? createMemoryOutbox() : createIdbOutbox();
