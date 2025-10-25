// @ts-check
import { writable, derived } from 'svelte/store';
import { odooClient } from '$lib/odoo';
import { calculateBalances } from '$lib/expenseUtils';

// Cache configuration
const CACHE_KEY_PREFIX = 'expense_cache_v4_group_'; // Per-group cache
const CACHE_META_KEY_PREFIX = 'expense_cache_meta_v4_group_';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache validity
const SYNC_INTERVAL_MS = 3 * 60 * 1000; // Background sync every 3 minute

/**
 * @typedef {Object} ExpenseRecord
 * @property {number} id
 * @property {string} x_name
 * @property {number} x_studio_value
 * @property {any} x_studio_who_paid
 * @property {any} x_studio_participants
 * @property {string} x_studio_type
 * @property {string} x_studio_date
 * @property {boolean} [x_studio_is_done]
 * @property {any} [x_studio_expensegroup]
 */

/**
 * @typedef {Object} CacheMeta
 * @property {number} lastSyncTime
 * @property {number} lastRecordId
 * @property {number} recordCount
 * @property {boolean} isStale
 * @property {number|null} selectedGroupId
 */

/**
 * @typedef {Object} CacheState
 * @property {ExpenseRecord[]} expenses
 * @property {boolean} loading
 * @property {boolean} syncing
 * @property {string} error
 * @property {CacheMeta} meta
 * @property {Record<string, number>} balances
 * @property {number|null} selectedGroupId
 */

// Helper functions for localStorage
function loadFromStorage(groupId = null) {
	try {
		// If no group specified, return empty
		if (!groupId) {
			return {
				expenses: [],
				meta: {
					lastSyncTime: 0,
					lastRecordId: 0,
					recordCount: 0,
					isStale: true,
					selectedGroupId: null
				}
			};
		}
		
		const cacheKey = `${CACHE_KEY_PREFIX}${groupId}`;
		const metaKey = `${CACHE_META_KEY_PREFIX}${groupId}`;
		
		const cachedData = localStorage.getItem(cacheKey);
		const meta = localStorage.getItem(metaKey);
		
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
			isStale: true,
			selectedGroupId: groupId
		}
	};
}

function saveToStorage(expenses, meta) {
	try {
		if (!meta.selectedGroupId) return; // Don't save if no group selected
		
		const cacheKey = `${CACHE_KEY_PREFIX}${meta.selectedGroupId}`;
		const metaKey = `${CACHE_META_KEY_PREFIX}${meta.selectedGroupId}`;
		
		localStorage.setItem(cacheKey, JSON.stringify(expenses));
		localStorage.setItem(metaKey, JSON.stringify({
			lastSyncTime: meta.lastSyncTime || Date.now(),
			lastRecordId: meta.lastRecordId || 0,
			recordCount: expenses.length,
			isStale: false,
			selectedGroupId: meta.selectedGroupId
		}));
	} catch (e) {
		console.warn('Failed to save cache to storage:', e);
	}
}

function clearStorage(groupId = null) {
	try {
		if (groupId) {
			// Clear specific group cache
			const cacheKey = `${CACHE_KEY_PREFIX}${groupId}`;
			const metaKey = `${CACHE_META_KEY_PREFIX}${groupId}`;
			localStorage.removeItem(cacheKey);
			localStorage.removeItem(metaKey);
		} else {
			// Clear all caches
			const keys = Object.keys(localStorage);
			keys.forEach(key => {
				if (key.startsWith(CACHE_KEY_PREFIX) || key.startsWith(CACHE_META_KEY_PREFIX)) {
					localStorage.removeItem(key);
				}
			});
		}
	} catch (e) {
		console.warn('Failed to clear cache:', e);
	}
}

// Create the main store
function createExpenseCacheStore() {
	// Start with empty state
	const initialCache = { expenses: [], meta: { lastSyncTime: 0, lastRecordId: 0, recordCount: 0, isStale: true, selectedGroupId: null } };
	
	/** @type {import('svelte/store').Writable<CacheState>} */
	const { subscribe, set, update } = writable({
		expenses: initialCache.expenses,
		loading: false,
		syncing: false,
		error: '',
		meta: initialCache.meta,
		balances: calculateBalances(initialCache.expenses),
		selectedGroupId: initialCache.meta.selectedGroupId || null
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
		// Only show syncing indicator, don't set loading
		update(state => ({ ...state, syncing: true, error: '' }));
		
		try {
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

			let currentState;
			subscribe(s => currentState = s)();

			// Determine domain based on cache state and group filter
			let domain = [];
			let fetchedExpenses = [];

			// Build base domain with group filter if selected
			if (currentState.selectedGroupId) {
				domain.push(['x_studio_expensegroup', '=', currentState.selectedGroupId]);
			}

			// For incremental sync, only fetch if we have matching cached data
			if (!forceFullRefresh && currentState.meta.lastRecordId > 0 && 
			    currentState.meta.selectedGroupId === currentState.selectedGroupId) {
				// Incremental fetch - get only new records
				domain.push(['id', '>', currentState.meta.lastRecordId]);
				
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
				// Full refresh - reset domain with group filter only
				domain = [];
				if (currentState.selectedGroupId) {
					domain.push(['x_studio_expensegroup', '=', currentState.selectedGroupId]);
				}
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
				isStale: false,
				selectedGroupId: currentState.selectedGroupId
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
				error: '',
				selectedGroupId: currentState.selectedGroupId
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
		// Get current group
		let currentGroupId;
		subscribe(s => currentGroupId = s.selectedGroupId)();
		
		// Load cached data for the current group
		const currentState = loadFromStorage(currentGroupId);
		
		if (currentState.expenses.length > 0) {
			// Show cached data immediately (no loading state)
			const expensesWithNames = await resolvePartnerNames(currentState.expenses);
			const balances = calculateBalances(expensesWithNames);
			
			update(state => ({
				...state,
				expenses: expensesWithNames,
				balances,
				loading: false,
				meta: currentState.meta
			}));
			
			// Then sync in the background if stale
			if (currentState.meta.isStale) {
				sync();
			}
		} else if (currentGroupId) {
			// No cache for this group, do initial sync
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
		// Don't clear storage immediately - let sync handle it
		partnerMap.clear();
		await sync(true);
	}

	// Set group filter and refresh
	async function setGroupFilter(groupId) {
		// Load cached data for the new group first
		const cachedState = loadFromStorage(groupId);
		
		if (cachedState.expenses.length > 0) {
			// Show cached data immediately
			const expensesWithNames = await resolvePartnerNames(cachedState.expenses);
			const balances = calculateBalances(expensesWithNames);
			
			update(state => ({
				...state,
				selectedGroupId: groupId,
				expenses: expensesWithNames,
				balances,
				loading: false,
				meta: cachedState.meta
			}));
			
			// Sync in background if stale
			if (cachedState.meta.isStale) {
				sync();
			}
		} else {
			// No cache for this group, load fresh
			update(state => ({
				...state,
				selectedGroupId: groupId,
				expenses: [],
				balances: {},
				loading: true,
				meta: {
					...state.meta,
					selectedGroupId: groupId,
					isStale: true
				}
			}));
			
			await sync(true);
			update(state => ({ ...state, loading: false }));
		}
		
		partnerMap.clear();
	}

	// Update expenses optimistically (for instant UI updates)
	function updateExpenses(updatedExpenses) {
		const newBalances = calculateBalances(updatedExpenses);
		update(state => ({
			...state,
			expenses: updatedExpenses,
			balances: newBalances
		}));
	}

	return {
		subscribe,
		initialize,
		sync,
		forceRefresh,
		destroy,
		setGroupFilter,
		updateExpenses
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