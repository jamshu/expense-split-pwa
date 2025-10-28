// @ts-check
import { writable } from 'svelte/store';
import { odooClient } from '$lib/odoo';
import { STORES, getAll, put, putMany, remove, meta } from '$lib/db';

const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * @typedef {Object} ExpenseGroup
 * @property {number|string} id
 * @property {string} name
 * @property {string} [display_name]
 * @property {any[]} [x_studio_members]
 * @property {any[]} [participants]
 * @property {string} [description]
 * @property {string} syncStatus - 'synced' | 'pending' | 'failed'
 */

function createGroupCacheStore() {
	const initialState = {
		groups: [],
		loading: false,
		error: '',
		lastSync: 0
	};

	const { subscribe, update } = writable(initialState);

	// Load from IndexedDB
	async function loadFromDB() {
		try {
			const groups = await getAll(STORES.GROUPS);
			const lastSyncTime = await meta('lastGroupSync') || 0;

			return {
				groups: groups.sort((a, b) => {
					const aId = typeof a.id === 'number' ? a.id : 0;
					const bId = typeof b.id === 'number' ? b.id : 0;
					return aId - bId;
				}),
				lastSync: lastSyncTime
			};
		} catch (error) {
			console.error('Failed to load groups from IndexedDB:', error);
			return { groups: [], lastSync: 0 };
		}
	}

	// Sync with server
	async function sync(forceFullRefresh = false) {
		if (!navigator.onLine) {
			console.log('Offline - skipping group sync');
			return;
		}

		update(state => ({ ...state, loading: true, error: '' }));

		try {
			const fields = ['id', 'display_name', 'x_studio_members'];
			const fetchedGroups = await odooClient.fetchExpenseGroups([], fields);

			// Mark as synced
			const syncedGroups = fetchedGroups.map(g => ({
				...g,
				syncStatus: 'synced'
			}));

			// Extract and store all unique partners from groups
			const allPartners = [];
			const partnerIds = new Set();
			
			for (const group of syncedGroups) {
				if (Array.isArray(group.x_studio_members)) {
					for (const member of group.x_studio_members) {
						let partnerId, partnerName;
						
						if (Array.isArray(member) && member.length >= 2) {
							// Format: [id, "display_name"]
							partnerId = Number(member[0]);
							partnerName = member[1];
						} else if (typeof member === 'number') {
							// Just ID, need to fetch the name
							partnerIds.add(Number(member));
							continue;
						}
						
						if (partnerId && partnerName && !partnerIds.has(partnerId)) {
							partnerIds.add(partnerId);
							allPartners.push({ id: partnerId, display_name: partnerName });
						}
					}
				}
			}
			
			// If we have IDs without names, fetch them
			if (partnerIds.size > allPartners.length && navigator.onLine) {
				try {
					const missingIds = Array.from(partnerIds).filter(id => !allPartners.find(p => p.id === id));
					if (missingIds.length > 0) {
						const partners = await odooClient.searchModel(
							'res.partner',
							[['id', 'in', missingIds]],
							['id', 'display_name', 'x_studio_is_default']
						);
						allPartners.push(...partners);
					}
				} catch (err) {
					console.warn('Failed to fetch missing partner names:', err);
				}
			}

			// Save groups and partners to IndexedDB
			// Partners are saved with putMany which updates existing records
			await putMany(STORES.GROUPS, syncedGroups);
			if (allPartners.length > 0) {
				console.log('Updating partners cache:', allPartners);
				await putMany(STORES.PARTNERS, allPartners);
			}
			await meta('lastGroupSync', Date.now());

			update(state => ({
				...state,
				groups: syncedGroups,
				loading: false,
				lastSync: Date.now(),
				error: ''
			}));

		} catch (error) {
			console.error('Group sync failed:', error);
			update(state => ({
				...state,
				loading: false,
				error: error.message || 'Failed to sync groups'
			}));
		}
	}

	// Initialize
	async function initialize() {
		update(state => ({ ...state, loading: true }));

		try {
			const cached = await loadFromDB();

			if (cached.groups.length > 0) {
				update(state => ({
					...state,
					groups: cached.groups,
					loading: false,
					lastSync: cached.lastSync
				}));

				// Background sync if stale
				const now = Date.now();
				if (now - cached.lastSync > CACHE_DURATION_MS && navigator.onLine) {
					sync();
				}
			} else if (navigator.onLine) {
				await sync(true);
			} else {
				update(state => ({ ...state, loading: false }));
			}

		} catch (error) {
			console.error('Group initialization failed:', error);
			update(state => ({
				...state,
				loading: false,
				error: error.message || 'Failed to initialize'
			}));
		}
	}

	return {
		subscribe,
		initialize,
		sync
	};
}

export const groupCache = createGroupCacheStore();
