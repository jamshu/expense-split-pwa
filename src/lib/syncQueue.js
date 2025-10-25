// @ts-check
import { writable } from 'svelte/store';
import { STORES, getAll, put, remove, getByIndex } from './db.js';
import { odooClient } from './odoo.js';
// STORES is already imported above - includes EXPENSES

/**
 * @typedef {Object} SyncQueueItem
 * @property {number} [id] - Queue item ID (auto-generated)
 * @property {string} operation - 'create' | 'update' | 'delete'
 * @property {string} model - 'expense' | 'group'
 * @property {any} data - The data to sync
 * @property {string} localId - Temporary local ID for new records
 * @property {number} [remoteId] - Remote ID if known
 * @property {number} timestamp - When the operation was queued
 * @property {string} status - 'pending' | 'syncing' | 'failed'
 * @property {string} [error] - Error message if failed
 * @property {number} retryCount - Number of retry attempts
 */

/**
 * @typedef {Object} SyncStatus
 * @property {boolean} isSyncing
 * @property {number} pendingCount
 * @property {number} failedCount
 * @property {string} [lastError]
 */

// Sync status store
const initialStatus = {
	isSyncing: false,
	pendingCount: 0,
	failedCount: 0,
	lastError: null
};

export const syncStatus = writable(initialStatus);

/**
 * Add an operation to the sync queue
 * @param {string} operation - 'create' | 'update' | 'delete'
 * @param {string} model - 'expense' | 'group'
 * @param {any} data
 * @param {string} [localId]
 * @param {number} [remoteId]
 * @returns {Promise<number>}
 */
export async function queueOperation(operation, model, data, localId = null, remoteId = null) {
	/** @type {SyncQueueItem} */
	const item = {
		operation,
		model,
		data,
		localId: localId || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
		remoteId,
		timestamp: Date.now(),
		status: 'pending',
		retryCount: 0
	};

	const id = await put(STORES.SYNC_QUEUE, item);
	await updateSyncStatus();
	return id;
}

/**
 * Get all pending sync queue items
 * @returns {Promise<SyncQueueItem[]>}
 */
export async function getPendingItems() {
	const pending = await getByIndex(STORES.SYNC_QUEUE, 'status', 'pending');
	const failed = await getByIndex(STORES.SYNC_QUEUE, 'status', 'failed');
	return [...pending, ...failed].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Update sync status in the store
 */
async function updateSyncStatus() {
	const pending = await getByIndex(STORES.SYNC_QUEUE, 'status', 'pending');
	const failed = await getByIndex(STORES.SYNC_QUEUE, 'status', 'failed');

	syncStatus.update(status => ({
		...status,
		pendingCount: pending.length,
		failedCount: failed.length
	}));
}

/**
 * Process a single queue item
 * @param {SyncQueueItem} item
 * @returns {Promise<{success: boolean, remoteId?: number, error?: string}>}
 */
async function processQueueItem(item) {
	try {
		let remoteId = item.remoteId;

		switch (item.operation) {
			case 'create':
				if (item.model === 'expense') {
					remoteId = await odooClient.createExpense(item.data);
				}
				// Add group creation here when implemented
				break;

			case 'update':
				if (item.model === 'expense' && remoteId) {
					await odooClient.updateExpense(remoteId, item.data);
				}
				// Add group update here when implemented
				break;

			case 'delete':
				if (item.model === 'expense' && remoteId) {
					await odooClient.deleteExpense(remoteId);
				}
				// Add group delete here when implemented
				break;

			default:
				throw new Error(`Unknown operation: ${item.operation}`);
		}

		return { success: true, remoteId };
	} catch (error) {
		console.error('Failed to process queue item:', error);
		return { 
			success: false, 
			error: error.message || 'Unknown error'
		};
	}
}

/**
 * Process the entire sync queue
 * @returns {Promise<{processed: number, failed: number}>}
 */
export async function processSyncQueue() {
	// Check if online
	if (!navigator.onLine) {
		console.log('Offline - skipping sync');
		return { processed: 0, failed: 0 };
	}

	syncStatus.update(s => ({ ...s, isSyncing: true, lastError: null }));

	const items = await getPendingItems();
	let processed = 0;
	let failed = 0;

	for (const item of items) {
		// Update item status to syncing
		await put(STORES.SYNC_QUEUE, { ...item, status: 'syncing' });

		const result = await processQueueItem(item);

		if (result.success) {
			// Remove from queue on success
			await remove(STORES.SYNC_QUEUE, item.id);
			processed++;

			// If this was a create operation, replace local record with server record
			if (item.operation === 'create' && result.remoteId && item.localId) {
				console.log(`Local ID ${item.localId} -> Remote ID ${result.remoteId}`);
				
				// Remove the local record
				try {
					await remove(STORES.EXPENSES, item.localId);
				} catch (err) {
					console.warn('Failed to remove local expense:', err);
				}
			}
			
			// If this was a delete operation, ensure local record is removed
			if (item.operation === 'delete' && item.remoteId) {
				try {
					await remove(STORES.EXPENSES, item.remoteId);
				} catch (err) {
					console.warn('Failed to remove expense after delete:', err);
				}
			}
		} else {
			// Mark as failed and increment retry count
			const updatedItem = {
				...item,
				status: 'failed',
				error: result.error,
				retryCount: item.retryCount + 1
			};

			// Remove from queue if retry limit exceeded (e.g., 5 retries)
			if (updatedItem.retryCount >= 5) {
				console.error('Max retries exceeded for queue item:', item);
				await remove(STORES.SYNC_QUEUE, item.id);
			} else {
				await put(STORES.SYNC_QUEUE, updatedItem);
			}

			failed++;
			syncStatus.update(s => ({ ...s, lastError: result.error }));
		}
	}

	syncStatus.update(s => ({ ...s, isSyncing: false }));
	await updateSyncStatus();

	return { processed, failed };
}

/**
 * Clear all failed items from the queue
 */
export async function clearFailedItems() {
	const failed = await getByIndex(STORES.SYNC_QUEUE, 'status', 'failed');
	for (const item of failed) {
		await remove(STORES.SYNC_QUEUE, item.id);
	}
	await updateSyncStatus();
}

/**
 * Retry all failed items
 */
export async function retryFailedItems() {
	const failed = await getByIndex(STORES.SYNC_QUEUE, 'status', 'failed');
	for (const item of failed) {
		await put(STORES.SYNC_QUEUE, { ...item, status: 'pending', error: null });
	}
	await updateSyncStatus();
	return processSyncQueue();
}

// Initialize sync status on module load
updateSyncStatus();
