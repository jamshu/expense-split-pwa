// @ts-check

/**
 * IndexedDB wrapper for offline-first storage
 * Stores expenses, groups, and sync queue
 */

const DB_NAME = 'expense_split_db';
const DB_VERSION = 2; // Incremented to add partners store

// Object store names
export const STORES = {
	EXPENSES: 'expenses',
	GROUPS: 'groups',
	PARTNERS: 'partners',
	SYNC_QUEUE: 'sync_queue',
	META: 'meta'
};

/** @type {IDBDatabase | null} */
let db = null;

/**
 * Initialize the database
 * @returns {Promise<IDBDatabase>}
 */
export async function initDB() {
	if (db) return db;

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			db = request.result;
			resolve(db);
		};

		request.onupgradeneeded = (event) => {
			const database = /** @type {IDBDatabase} */ (event.target?.result);

			// Expenses store
			if (!database.objectStoreNames.contains(STORES.EXPENSES)) {
				const expenseStore = database.createObjectStore(STORES.EXPENSES, { keyPath: 'id' });
				expenseStore.createIndex('x_studio_date', 'x_studio_date', { unique: false });
				expenseStore.createIndex('x_studio_is_done', 'x_studio_is_done', { unique: false });
				expenseStore.createIndex('syncStatus', 'syncStatus', { unique: false });
			}

			// Groups store
			if (!database.objectStoreNames.contains(STORES.GROUPS)) {
				const groupStore = database.createObjectStore(STORES.GROUPS, { keyPath: 'id' });
				groupStore.createIndex('name', 'name', { unique: false });
				groupStore.createIndex('syncStatus', 'syncStatus', { unique: false });
			}

			// Partners store
			if (!database.objectStoreNames.contains(STORES.PARTNERS)) {
				const partnerStore = database.createObjectStore(STORES.PARTNERS, { keyPath: 'id' });
				partnerStore.createIndex('display_name', 'display_name', { unique: false });
			}

			// Sync queue store
			if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
				const syncStore = database.createObjectStore(STORES.SYNC_QUEUE, { 
					keyPath: 'id',
					autoIncrement: true 
				});
				syncStore.createIndex('timestamp', 'timestamp', { unique: false });
				syncStore.createIndex('status', 'status', { unique: false });
			}

			// Meta store for timestamps and other metadata
			if (!database.objectStoreNames.contains(STORES.META)) {
				database.createObjectStore(STORES.META, { keyPath: 'key' });
			}
		};
	});
}

/**
 * Get all records from a store
 * @param {string} storeName
 * @returns {Promise<any[]>}
 */
export async function getAll(storeName) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readonly');
		const store = transaction.objectStore(storeName);
		const request = store.getAll();

		request.onsuccess = () => resolve(request.result || []);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Get a single record by ID
 * @param {string} storeName
 * @param {number|string} id
 * @returns {Promise<any>}
 */
export async function getById(storeName, id) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readonly');
		const store = transaction.objectStore(storeName);
		const request = store.get(id);

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Add or update a record
 * @param {string} storeName
 * @param {any} record
 * @returns {Promise<any>}
 */
export async function put(storeName, record) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readwrite');
		const store = transaction.objectStore(storeName);
		const request = store.put(record);

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Add multiple records
 * @param {string} storeName
 * @param {any[]} records
 * @returns {Promise<void>}
 */
export async function putMany(storeName, records) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readwrite');
		const store = transaction.objectStore(storeName);

		let completed = 0;
		const total = records.length;

		for (const record of records) {
			const request = store.put(record);
			request.onsuccess = () => {
				completed++;
				if (completed === total) {
					resolve();
				}
			};
			request.onerror = () => reject(request.error);
		}

		if (total === 0) resolve();
	});
}

/**
 * Delete a record by ID
 * @param {string} storeName
 * @param {number|string} id
 * @returns {Promise<void>}
 */
export async function remove(storeName, id) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readwrite');
		const store = transaction.objectStore(storeName);
		const request = store.delete(id);

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * Clear all records from a store
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export async function clear(storeName) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readwrite');
		const store = transaction.objectStore(storeName);
		const request = store.clear();

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * Get records by index
 * @param {string} storeName
 * @param {string} indexName
 * @param {any} value
 * @returns {Promise<any[]>}
 */
export async function getByIndex(storeName, indexName, value) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readonly');
		const store = transaction.objectStore(storeName);
		const index = store.index(indexName);
		const request = index.getAll(value);

		request.onsuccess = () => resolve(request.result || []);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Get or set metadata
 * @param {string} key
 * @param {any} [value]
 * @returns {Promise<any>}
 */
export async function meta(key, value) {
	const database = await initDB();
	
	if (value !== undefined) {
		// Set metadata
		return new Promise((resolve, reject) => {
			const transaction = database.transaction(STORES.META, 'readwrite');
			const store = transaction.objectStore(STORES.META);
			const request = store.put({ key, value, timestamp: Date.now() });

			request.onsuccess = () => resolve(value);
			request.onerror = () => reject(request.error);
		});
	} else {
		// Get metadata
		return new Promise((resolve, reject) => {
			const transaction = database.transaction(STORES.META, 'readonly');
			const store = transaction.objectStore(STORES.META);
			const request = store.get(key);

			request.onsuccess = () => resolve(request.result?.value);
			request.onerror = () => reject(request.error);
		});
	}
}
