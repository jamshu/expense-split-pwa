// @ts-check
import { writable } from 'svelte/store';

const DEFAULT_GROUP_KEY = 'default_expense_group';

/**
 * Load default group from localStorage
 * @returns {number|null}
 */
function loadDefaultGroup() {
	try {
		const stored = localStorage.getItem(DEFAULT_GROUP_KEY);
		return stored ? parseInt(stored, 10) : null;
	} catch (e) {
		console.warn('Failed to load default group:', e);
		return null;
	}
}

/**
 * Save default group to localStorage
 * @param {number|null} groupId
 */
function saveDefaultGroup(groupId) {
	try {
		if (groupId) {
			localStorage.setItem(DEFAULT_GROUP_KEY, String(groupId));
		} else {
			localStorage.removeItem(DEFAULT_GROUP_KEY);
		}
	} catch (e) {
		console.warn('Failed to save default group:', e);
	}
}

/**
 * Create a store for managing the default expense group
 */
function createDefaultGroupStore() {
	const { subscribe, set, update } = writable(loadDefaultGroup());

	return {
		subscribe,
		/**
		 * Set the default expense group
		 * @param {number|null} groupId
		 */
		setDefault: (groupId) => {
			saveDefaultGroup(groupId);
			set(groupId);
		},
		/**
		 * Get the current default group
		 * @returns {number|null}
		 */
		get: () => {
			return loadDefaultGroup();
		},
		/**
		 * Clear the default group
		 */
		clear: () => {
			saveDefaultGroup(null);
			set(null);
		}
	};
}

export const defaultGroup = createDefaultGroupStore();
