import { pwaLog } from './pwa-log';

const DB_NAME = 'mailbrus';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
	if (_db) return Promise.resolve(_db);
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (e) => {
			const db = (e.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains('outbox'))
				db.createObjectStore('outbox', { keyPath: 'id' });
			if (!db.objectStoreNames.contains('mutations'))
				db.createObjectStore('mutations', { keyPath: 'id' });
			if (!db.objectStoreNames.contains('messages'))
				db.createObjectStore('messages', { keyPath: 'key' });
			if (!db.objectStoreNames.contains('frecency'))
				db.createObjectStore('frecency', { keyPath: 'key' });
			if (!db.objectStoreNames.contains('settings'))
				db.createObjectStore('settings', { keyPath: 'key' });
		};
		req.onsuccess = () => { _db = req.result; resolve(_db); };
		req.onerror = () => reject(req.error);
		// A blocked open (another connection holding a pending versionchange/delete)
		// would otherwise hang this promise forever. Reject so callers can fall back.
		req.onblocked = () => reject(new Error('indexedDB open blocked'));
	});
}

function tx(store: string, mode: IDBTransactionMode) {
	return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
	const s = await tx(store, 'readonly');
	return new Promise((resolve, reject) => {
		const r = s.get(key);
		r.onsuccess = () => { pwaLog('idb', `get ${store}[${key}]=${JSON.stringify(r.result)}`); resolve(r.result); };
		r.onerror = () => reject(r.error);
	});
}

export async function idbPut<T extends object>(store: string, value: T): Promise<void> {
	const s = await tx(store, 'readwrite');
	return new Promise((resolve, reject) => {
		const r = s.put(value);
		r.onsuccess = () => { pwaLog('idb', `put ${store}`); resolve(); };
		r.onerror = () => reject(r.error);
	});
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
	const s = await tx(store, 'readwrite');
	return new Promise((resolve, reject) => {
		const r = s.delete(key);
		r.onsuccess = () => { pwaLog('idb', `delete ${store}[${key}]`); resolve(); };
		r.onerror = () => reject(r.error);
	});
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
	const s = await tx(store, 'readonly');
	return new Promise((resolve, reject) => {
		const r = s.getAll();
		r.onsuccess = () => { pwaLog('idb', `getAll ${store} (${r.result?.length ?? 0})`); resolve(r.result); };
		r.onerror = () => reject(r.error);
	});
}
