// @ts-check
import { writable, derived } from 'svelte/store';
import { odooClient } from '$lib/odoo';
import { calculateBalances } from '$lib/expenseUtils';

// Cache configuration
const CACHE_KEY = 'expense_cache_v2';
const CACHE_META_KEY = 'expense_cache_meta';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache validity
const SYNC_INTERVAL_MS = 15 * 1000; // Background sync every 15 seconds

/**
 * @typedef {Object} ExpenseRecord
 * @property {number} id
 * @property {string} x_name
 * @property {number} x_studio_value
 * @property {any} x_studio_who_paid
 * @property {any} x_studio_participants
 * @property {string} x_studio_type
 * @property {string} x_studio_date
 */

/**
 * @typedef {Object} CacheMeta
 * @property {number} lastSyncTime
 * @property {number} lastRecordId
 * @property {number} recordCount
 * @property {boolean} isStale
 */

/**
 * @typedef {Object} CacheState
 * @property {ExpenseRecord[]} expenses
 * @property {boolean} loading
 * @property {boolean} syncing
 * @property {string} error
 * @property {CacheMeta} meta
 * @property {Record<string, number>} balances
 */

// Helper functions for localStorage
function loadFromStorage() {
	try {
		const cachedData = localStorage.getItem(CACHE_KEY);
		const meta = localStorage.getItem(CACHE_META_KEY);
		
		if (cachedData && meta) {
			const expenses = JSON.parse(cachedData);
			const metaData = JSON.parse(meta);
			
			// Check if cache is stale
			const now = Date.now();
			const isStale = now - metaData.lastSyncTime > CACHE_DURATION_MS;
			
			return {
				expenses,
				meta: { ...metaData, isStale }
			};
		}
	} catch (e) {
		console.warn('Failed to load cache from storage:', e);
	}
	
	return {
		expenses: [],
		meta: {
			lastSyncTime: 0,
			lastRecordId: 0,
			recordCount: 0,
			isStale: true
		}
	};
}

function saveToStorage(expenses, meta) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(expenses));
		localStorage.setItem(CACHE_META_KEY, JSON.stringify({
			lastSyncTime: meta.lastSyncTime || Date.now(),
			lastRecordId: meta.lastRecordId || 0,
			recordCount: expenses.length,
			isStale: false
		}));
	} catch (e) {
		console.warn('Failed to save cache to storage:', e);
	}
}

function clearStorage() {
	try {
		localStorage.removeItem(CACHE_KEY);
		localStorage.removeItem(CACHE_META_KEY);
	} catch (e) {
		console.warn('Failed to clear cache:', e);
	}
}

// Create the main store
function createExpenseCacheStore() {
	// Load initial state from cache
	const initialCache = loadFromStorage();
	
	/** @type {import('svelte/store').Writable<CacheState>} */
	const { subscribe, set, update } = writable({
		expenses: initialCache.expenses,
		loading: false,
		syncing: false,
		error: '',
		meta: initialCache.meta,
		balances: calculateBalances(initialCache.expenses)
	});
	
	let syncInterval = null;
	let partnerMap = new Map();
	
	// Helper to resolve partner names
	async function resolvePartnerNames(expenses) {
		try {
			// Collect all unique partner IDs
			const partnerIds = new Set();
			
			for (const expense of expenses) {
				// Extract IDs from who_paid field
				if (Array.isArray(expense.x_studio_who_paid) && expense.x_studio_who_paid.length > 0) {
					partnerIds.add(Number(expense.x_studio_who_paid[0]));
				} else if (typeof expense.x_studio_who_paid === 'number') {
					partnerIds.add(expense.x_studio_who_paid);
				}
				
				// Extract IDs from participants field
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
			
			// Fetch missing partner names
			const missingIds = Array.from(partnerIds).filter(id => !partnerMap.has(id));
			
			if (missingIds.length > 0) {
				const partners = await odooClient.searchModel(
					'res.partner',
					[['id', 'in', missingIds]],
					['id', 'display_name']
				);
				
				for (const partner of partners) {
					partnerMap.set(Number(partner.id), partner.display_name);
				}
			}
			
			// Map IDs to names in expenses
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
				
				return copy;
			});
			
		} catch (error) {
			console.warn('Failed to resolve partner names:', error);
			return expenses;
		}
	}
	
	// Sync function - fetches new data from server
	async function sync(forceFullRefresh = false) {
		update(state => ({ ...state, syncing: true, error: '' }));
		
		try {
			const fields = [
				'id',
				'x_name',
				'x_studio_value',
				'x_studio_who_paid',
				'x_studio_participants',
				'x_studio_type',
				'x_studio_date'
			];
			
			let currentState;
			subscribe(s => currentState = s)();
			
			// Determine domain based on cache state
			let domain = [];
			let fetchedExpenses = [];
			
			if (!forceFullRefresh && currentState.meta.lastRecordId > 0) {
				// Incremental fetch - get only new records
				domain = [['id', '>', currentState.meta.lastRecordId]];
				
				try {
					fetchedExpenses = await odooClient.searchExpenses(domain, fields);
					
					// If incremental fetch returns nothing, verify we're not missing data
					if (fetchedExpenses.length === 0) {
						// Do a count check to ensure we have all records
						const totalCount = await odooClient.searchExpenses([], ['id']);
						if (totalCount.length !== currentState.expenses.length) {
							// We're missing records, force full refresh
							forceFullRefresh = true;
						}
					}
				} catch (err) {
					console.warn('Incremental fetch failed, falling back to full fetch:', err);
					forceFullRefresh = true;
				}
			}
			
			if (forceFullRefresh || currentState.meta.lastRecordId === 0) {
				// Full refresh
				domain = [];
				fetchedExpenses = await odooClient.searchExpenses(domain, fields);
			}
			
			// Merge or replace expenses
			let mergedExpenses;
			if (forceFullRefresh || currentState.meta.lastRecordId === 0) {
				// Replace all expenses
				mergedExpenses = fetchedExpenses;
			} else {
				// Merge new expenses with existing ones
				const existingIds = new Set(currentState.expenses.map(e => e.id));
				const newExpenses = fetchedExpenses.filter(e => !existingIds.has(e.id));
				
				// Also check for updated expenses (same ID but different data)
				const updatedExpenses = fetchedExpenses.filter(e => existingIds.has(e.id));
				
				if (updatedExpenses.length > 0) {
					// Replace updated expenses
					mergedExpenses = currentState.expenses.map(e => {
						const updated = updatedExpenses.find(u => u.id === e.id);
						return updated || e;
					}).concat(newExpenses);
				} else {
					// Just append new expenses
					mergedExpenses = [...currentState.expenses, ...newExpenses];
				}
			}
			
			// Sort by ID to ensure consistent ordering
			mergedExpenses.sort((a, b) => a.id - b.id);
			
			// Resolve partner names
			const expensesWithNames = await resolvePartnerNames(mergedExpenses);
			
			// Calculate new metadata
			const lastRecordId = expensesWithNames.length > 0 
				? Math.max(...expensesWithNames.map(e => e.id))
				: 0;
			
			const newMeta = {
				lastSyncTime: Date.now(),
				lastRecordId,
				recordCount: expensesWithNames.length,
				isStale: false
			};
			
			// Save to storage
			saveToStorage(expensesWithNames, newMeta);
			
			// Calculate balances
			const newBalances = calculateBalances(expensesWithNames);
			
			// Update store
			update(state => ({
				...state,
				expenses: expensesWithNames,
				meta: newMeta,
				balances: newBalances,
				syncing: false,
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
	
	// Initial load - show cached data immediately, then sync in background
	async function initialize() {
		update(state => ({ ...state, loading: true }));
		
		// If we have cached data, show it immediately
		const currentState = loadFromStorage();
		if (currentState.expenses.length > 0) {
			// Resolve names for cached data
			const expensesWithNames = await resolvePartnerNames(currentState.expenses);
			const balances = calculateBalances(expensesWithNames);
			
			update(state => ({
				...state,
				expenses: expensesWithNames,
				balances,
				loading: false
			}));
			
			// Then sync in the background
			if (currentState.meta.isStale) {
				sync();
			}
		} else {
			// No cache, do initial sync
			update(state => ({ ...state, loading: true }));
			await sync(true);
			update(state => ({ ...state, loading: false }));
		}
		
		// Set up periodic background sync
		if (syncInterval) {
			clearInterval(syncInterval);
		}
		
		syncInterval = setInterval(() => {
			sync();
		}, SYNC_INTERVAL_MS);
	}
	
	// Clean up function
	function destroy() {
		if (syncInterval) {
			clearInterval(syncInterval);
			syncInterval = null;
		}
	}
	
	// Force refresh function
	async function forceRefresh() {
		clearStorage();
		partnerMap.clear();
		await sync(true);
	}
	
	return {
		subscribe,
		initialize,
		sync,
		forceRefresh,
		destroy
	};
}

// Create a singleton store instance
export const expenseCache = createExpenseCacheStore();

// Derived store for recent expenses
export const recentExpenses = derived(
	expenseCache,
	$cache => $cache.expenses.slice(-10).reverse()
);

// Derived store for loading states
export const cacheStatus = derived(
	expenseCache,
	$cache => ({
		isLoading: $cache.loading,
		isSyncing: $cache.syncing,
		hasError: !!$cache.error,
		error: $cache.error,
		isStale: $cache.meta.isStale,
		lastSync: $cache.meta.lastSyncTime,
		recordCount: $cache.meta.recordCount
	})
);