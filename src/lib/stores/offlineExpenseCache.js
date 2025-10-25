// @ts-check
import { writable, derived } from 'svelte/store';
import { odooClient } from '$lib/odoo';
import { calculateBalances } from '$lib/expenseUtils';
import { STORES, getAll, put, putMany, remove, meta } from '$lib/db';
import { queueOperation, processSyncQueue, syncStatus as queueStatus } from '$lib/syncQueue';

const CACHE_DURATION_MS = 5 * 60 * 1000;
const SYNC_INTERVAL_MS = 3 * 60 * 1000;

/**
 * @typedef {Object} ExpenseRecord
 * @property {number|string} id
 * @property {string} x_name
 * @property {number} x_studio_value
 * @property {any} x_studio_who_paid
 * @property {any} x_studio_participants
 * @property {string} x_studio_type
 * @property {string} x_studio_date
 * @property {boolean} [x_studio_is_done]
 * @property {any} [x_studio_expensegroup]
 * @property {string} syncStatus - 'synced' | 'pending' | 'failed'
 * @property {number} [localTimestamp] - For offline-created records
 */

/**
 * @typedef {Object} CacheState
 * @property {ExpenseRecord[]} expenses
 * @property {boolean} loading
 * @property {boolean} syncing
 * @property {string} error
 * @property {Record<string, number>} balances
 * @property {boolean} isOffline
 * @property {number} lastSync
 * @property {boolean} isStale
 */

function createOfflineExpenseCacheStore() {
	const initialState = {
		expenses: [],
		loading: false,
		syncing: false,
		error: '',
		balances: {},
		isOffline: !navigator.onLine,
		lastSync: 0,
		isStale: true
	};

	const { subscribe, set, update } = writable(initialState);

	let syncInterval = null;
	let onlineListener = null;
	let offlineListener = null;

	// Helper to resolve partner and group names
	async function resolvePartnerNames(expenses) {
		try {
			// Load all partners and groups from IndexedDB
			const cachedPartners = await getAll(STORES.PARTNERS);
			const cachedGroups = await getAll(STORES.GROUPS);
			
			const partnerMap = new Map(cachedPartners.map(p => [Number(p.id), p.display_name]));
			const groupMap = new Map(cachedGroups.map(g => [Number(g.id), g.display_name]));
			
			const partnerIds = new Set();
			const groupIds = new Set();

			for (const expense of expenses) {
				if (Array.isArray(expense.x_studio_who_paid) && expense.x_studio_who_paid.length > 0) {
					partnerIds.add(Number(expense.x_studio_who_paid[0]));
				} else if (typeof expense.x_studio_who_paid === 'number') {
					partnerIds.add(expense.x_studio_who_paid);
				}

				if (Array.isArray(expense.x_studio_participants)) {
					for (const p of expense.x_studio_participants) {
						if (Array.isArray(p) && p.length > 0) {
							partnerIds.add(Number(p[0]));
						} else if (typeof p === 'number') {
							partnerIds.add(p);
						}
					}
				}
			}

			// Extract group IDs from all expenses
			for (const expense of expenses) {
				if (Array.isArray(expense.x_studio_expensegroup) && expense.x_studio_expensegroup.length > 0) {
					groupIds.add(Number(expense.x_studio_expensegroup[0]));
				} else if (typeof expense.x_studio_expensegroup === 'number') {
					groupIds.add(expense.x_studio_expensegroup);
				}
			}

			const missingIds = Array.from(partnerIds).filter(id => !partnerMap.has(id));
			const missingGroupIds = Array.from(groupIds).filter(id => !groupMap.has(id));

			// Fetch missing partner names
			if (missingIds.length > 0 && navigator.onLine) {
				try {
					const partners = await odooClient.searchModel(
						'res.partner',
						[['id', 'in', missingIds]],
						['id', 'display_name']
					);

					// Store partners in IndexedDB
					for (const partner of partners) {
						partnerMap.set(Number(partner.id), partner.display_name);
						await put(STORES.PARTNERS, partner);
					}
				} catch (err) {
					console.warn('Failed to fetch partner names (offline?):', err);
				}
			}

			// Fetch missing group names (groups are already in IndexedDB from groupCache)
			if (missingGroupIds.length > 0 && navigator.onLine) {
				try {
					const groups = await odooClient.searchModel(
						'x_expensegroup',
						[['id', 'in', missingGroupIds]],
						['id', 'display_name']
					);

					// Store groups in map (already in IndexedDB via groupCache)
					for (const group of groups) {
						groupMap.set(Number(group.id), group.display_name);
					}
				} catch (err) {
					console.warn('Failed to fetch group names (offline?):', err);
				}
			}

			return expenses.map(expense => {
				const copy = { ...expense };

				// Resolve who_paid
				if (Array.isArray(copy.x_studio_who_paid) && copy.x_studio_who_paid.length > 0) {
					const id = Number(copy.x_studio_who_paid[0]);
					copy.x_studio_who_paid = partnerMap.get(id) || copy.x_studio_who_paid[1] || String(id);
				} else if (typeof copy.x_studio_who_paid === 'number') {
					copy.x_studio_who_paid = partnerMap.get(copy.x_studio_who_paid) || String(copy.x_studio_who_paid);
				}

				// Resolve participants
				if (Array.isArray(copy.x_studio_participants)) {
					copy.x_studio_participants = copy.x_studio_participants.map(p => {
						if (Array.isArray(p) && p.length > 0) {
							const id = Number(p[0]);
							return partnerMap.get(id) || p[1] || String(id);
						} else if (typeof p === 'number') {
							return partnerMap.get(p) || String(p);
						}
						return String(p);
					});
				}

				// Resolve expense group
				if (Array.isArray(copy.x_studio_expensegroup) && copy.x_studio_expensegroup.length > 0) {
					const id = Number(copy.x_studio_expensegroup[0]);
					copy.x_studio_expensegroup = groupMap.get(id) || copy.x_studio_expensegroup[1] || String(id);
				} else if (typeof copy.x_studio_expensegroup === 'number') {
					copy.x_studio_expensegroup = groupMap.get(copy.x_studio_expensegroup) || String(copy.x_studio_expensegroup);
				}

				return copy;
			});

		} catch (error) {
			console.warn('Failed to resolve partner names:', error);
			return expenses;
		}
	}

	// Load expenses from IndexedDB
	async function loadFromDB() {
		try {
			const expenses = await getAll(STORES.EXPENSES);
			const lastSyncTime = await meta('lastExpenseSync') || 0;
			const now = Date.now();
			const isStale = now - lastSyncTime > CACHE_DURATION_MS;
			
			// Sort expenses
			const sortedExpenses = expenses.sort((a, b) => {
				const aId = typeof a.id === 'number' ? a.id : 0;
				const bId = typeof b.id === 'number' ? b.id : 0;
				return aId - bId;
			});
			
			// Always resolve partner names when loading from DB
			const expensesWithNames = await resolvePartnerNames(sortedExpenses);

			return {
				expenses: expensesWithNames,
				lastSync: lastSyncTime,
				isStale
			};
		} catch (error) {
			console.error('Failed to load from IndexedDB:', error);
			return { expenses: [], lastSync: 0, isStale: true };
		}
	}

	// Sync with server
	async function sync(forceFullRefresh = false) {
		if (!navigator.onLine) {
			console.log('Offline - skipping server sync');
			return;
		}

		update(state => ({ ...state, syncing: true, error: '' }));

		try {
			// First, process any pending sync queue items
			const syncResult = await processSyncQueue();
			
			// If items were processed, reload from DB to remove duplicates
			if (syncResult.processed > 0) {
				const cached = await loadFromDB();
				const expensesWithNames = await resolvePartnerNames(cached.expenses);
				const newBalances = calculateBalances(expensesWithNames);
				
				update(state => ({
					...state,
					expenses: expensesWithNames,
					balances: newBalances
				}));
			}

			const fields = [
				'id',
				'x_name',
				'x_studio_value',
				'x_studio_who_paid',
				'x_studio_participants',
				'x_studio_type',
				'x_studio_date',
				'x_studio_is_done',
				'x_studio_expensegroup'
			];

			const cached = await loadFromDB();
			let domain = [];
			let fetchedExpenses = [];

			if (!forceFullRefresh && cached.expenses.length > 0) {
				// Get max remote ID (excluding local IDs)
				const remoteExpenses = cached.expenses.filter(e => typeof e.id === 'number');
				if (remoteExpenses.length > 0) {
					const maxId = Math.max(...remoteExpenses.map(e => e.id));
					domain = [['id', '>', maxId]];
				}
			}

			if (forceFullRefresh || domain.length === 0) {
				fetchedExpenses = await odooClient.searchExpenses([], fields);
			} else {
				fetchedExpenses = await odooClient.searchExpenses(domain, fields);
			}

			// Mark fetched expenses as synced
			const syncedExpenses = fetchedExpenses.map(e => ({
				...e,
				syncStatus: 'synced'
			}));

			// Merge with existing data
			let mergedExpenses;
			if (forceFullRefresh) {
				// Keep local-only records
				const localExpenses = cached.expenses.filter(e => typeof e.id === 'string');
				mergedExpenses = [...syncedExpenses, ...localExpenses];
			} else {
				const existingIds = new Set(cached.expenses.map(e => e.id));
				const newExpenses = syncedExpenses.filter(e => !existingIds.has(e.id));
				mergedExpenses = [...cached.expenses, ...newExpenses];
			}

			// Save to IndexedDB
			await putMany(STORES.EXPENSES, mergedExpenses);
			await meta('lastExpenseSync', Date.now());

			// Resolve names and update store
			const expensesWithNames = await resolvePartnerNames(mergedExpenses);
			const newBalances = calculateBalances(expensesWithNames);

			update(state => ({
				...state,
				expenses: expensesWithNames,
				balances: newBalances,
				syncing: false,
				lastSync: Date.now(),
				isStale: false,
				error: ''
			}));

		} catch (error) {
			console.error('Sync failed:', error);
			update(state => ({
				...state,
				syncing: false,
				error: error.message || 'Failed to sync data'
			}));
		}
	}

	// Initialize
	async function initialize() {
		update(state => ({ ...state, loading: true }));

		try {
			const cached = await loadFromDB();

			if (cached.expenses.length > 0) {
				const expensesWithNames = await resolvePartnerNames(cached.expenses);
				const balances = calculateBalances(expensesWithNames);

				update(state => ({
					...state,
					expenses: expensesWithNames,
					balances,
					loading: false,
					lastSync: cached.lastSync,
					isStale: cached.isStale
				}));

				// Background sync if stale
				if (cached.isStale && navigator.onLine) {
					sync();
				}
			} else {
				// No cache, do initial sync
				if (navigator.onLine) {
					await sync(true);
				}
				update(state => ({ ...state, loading: false }));
			}

			// Set up periodic sync
			if (syncInterval) clearInterval(syncInterval);
			syncInterval = setInterval(() => {
				if (navigator.onLine) sync();
			}, SYNC_INTERVAL_MS);

			// Set up online/offline listeners
			onlineListener = () => {
				update(state => ({ ...state, isOffline: false }));
				sync(); // Auto-sync when coming online
			};

			offlineListener = () => {
				update(state => ({ ...state, isOffline: true }));
			};

			window.addEventListener('online', onlineListener);
			window.addEventListener('offline', offlineListener);

		} catch (error) {
			console.error('Initialization failed:', error);
			update(state => ({
				...state,
				loading: false,
				error: error.message || 'Failed to initialize'
			}));
		}
	}

	// Create a new expense (offline-first)
	async function createExpense(fields) {
		const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		// Convert Odoo many2many format to simple array of IDs for local storage
		const localFields = { ...fields };
		
		// Extract participant IDs from many2many command format: [[6, 0, [id1, id2, ...]]]
		if (Array.isArray(localFields.x_studio_participants) && 
		    localFields.x_studio_participants.length > 0 &&
		    Array.isArray(localFields.x_studio_participants[0]) &&
		    localFields.x_studio_participants[0][0] === 6) {
			// Extract the actual IDs from [[6, 0, [ids]]]
			localFields.x_studio_participants = localFields.x_studio_participants[0][2] || [];
		}
		
		// Create expense with resolved names for immediate display
		const newExpense = {
			id: localId,
			...localFields,
			syncStatus: 'pending',
			localTimestamp: Date.now()
		};
		
		// Resolve partner names immediately so they display correctly
		const resolvedExpenses = await resolvePartnerNames([newExpense]);
		const expenseWithNames = resolvedExpenses[0];

		// Save to IndexedDB with resolved names
		await put(STORES.EXPENSES, expenseWithNames);

		// Add to sync queue
		await queueOperation('create', 'expense', fields, localId);

		// Update store
		const cached = await loadFromDB();
		const expensesWithNames = await resolvePartnerNames(cached.expenses);
		const balances = calculateBalances(expensesWithNames);

		update(state => ({
			...state,
			expenses: expensesWithNames,
			balances
		}));

		// Try to sync if online
		if (navigator.onLine) {
			processSyncQueue().then(() => sync());
		}

		return localId;
	}

	// Update an expense (offline-first)
	async function updateExpense(id, values) {
		const expenses = await getAll(STORES.EXPENSES);
		const expense = expenses.find(e => e.id === id);

		if (!expense) {
			throw new Error('Expense not found');
		}

		const updatedExpense = {
			...expense,
			...values,
			syncStatus: 'pending'
		};

		await put(STORES.EXPENSES, updatedExpense);

		// Queue for sync if it has a remote ID
		if (typeof id === 'number') {
			await queueOperation('update', 'expense', values, null, id);
		}

		// Update store
		const cached = await loadFromDB();
		const expensesWithNames = await resolvePartnerNames(cached.expenses);
		const balances = calculateBalances(expensesWithNames);

		update(state => ({
			...state,
			expenses: expensesWithNames,
			balances
		}));

		// Try to sync if online
		if (navigator.onLine) {
			processSyncQueue().then(() => sync());
		}
	}

	// Delete an expense (offline-first)
	async function deleteExpense(id) {
		await remove(STORES.EXPENSES, id);

		// Queue for sync if it has a remote ID
		if (typeof id === 'number') {
			await queueOperation('delete', 'expense', {}, null, id);
		}

		// Update store
		const cached = await loadFromDB();
		const expensesWithNames = await resolvePartnerNames(cached.expenses);
		const balances = calculateBalances(expensesWithNames);

		update(state => ({
			...state,
			expenses: expensesWithNames,
			balances
		}));

		// Try to sync if online
		if (navigator.onLine) {
			processSyncQueue();
		}
	}

	// Force refresh
	async function forceRefresh() {
		await sync(true);
	}

	// Clean up
	function destroy() {
		if (syncInterval) {
			clearInterval(syncInterval);
			syncInterval = null;
		}
		if (onlineListener) {
			window.removeEventListener('online', onlineListener);
		}
		if (offlineListener) {
			window.removeEventListener('offline', offlineListener);
		}
	}

	return {
		subscribe,
		initialize,
		sync,
		createExpense,
		updateExpense,
		deleteExpense,
		forceRefresh,
		destroy
	};
}

export const offlineExpenseCache = createOfflineExpenseCacheStore();

// Derived stores
export const recentExpenses = derived(
	offlineExpenseCache,
	$cache => $cache.expenses.slice(-10).reverse()
);

export const cacheStatus = derived(
	[offlineExpenseCache, queueStatus],
	([$cache, $queue]) => ({
		isLoading: $cache.loading,
		isSyncing: $cache.syncing || $queue.isSyncing,
		hasError: !!$cache.error,
		error: $cache.error,
		isStale: $cache.isStale,
		isOffline: $cache.isOffline,
		lastSync: $cache.lastSync,
		recordCount: $cache.expenses.length,
		pendingSyncCount: $queue.pendingCount,
		failedSyncCount: $queue.failedCount
	})
);