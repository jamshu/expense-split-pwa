// @ts-check
import { base } from '$app/paths';

// Read PUBLIC_API_URL from Vite environment at build time (optional)
const PUBLIC_API_URL = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PUBLIC_API_URL
	? String(import.meta.env.PUBLIC_API_URL)
	: '';

/**
 * @typedef {Object} OdooClient
 * @property {(fields: Record<string, any>) => Promise<number>} createExpense
 * @property {(domain?: any[], fields?: string[]) => Promise<any[]>} searchExpenses
 * @property {(id: number, values: Record<string, any>) => Promise<boolean>} updateExpense
 * @property {(id: number) => Promise<boolean>} deleteExpense
 */

class OdooAPI {
	constructor() {
		// If a PUBLIC_API_URL is set at build time, use it as the API base.
		// This is required when the frontend is deployed to a static host (GitHub Pages)
		// and the server proxy runs on a separate host (e.g. Vercel/Render).
		if (PUBLIC_API_URL && PUBLIC_API_URL.trim() !== '') {
			this.apiUrl = `${PUBLIC_API_URL.replace(/\/$/, '')}/api/odoo`;
		} else {
			this.apiUrl = `${base}/api/odoo`;
		}
	}

	/**
	 * Call the server-side API
	 * @param {string} action
	 * @param {any} data
	 * @returns {Promise<any>}
	 */
	async callApi(action, data) {
		const response = await fetch(this.apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ action, data })
		});

		const result = await response.json();

		if (!result.success) {
			throw new Error(result.error || 'API Error');
		}

		return result;
	}

	/**
	 * Create a new expense record
	 * @param {Record<string, any>} fields
	 * @returns {Promise<number>}
	 */
	async createExpense(fields) {
		const result = await this.callApi('create', fields);
		return result.id;
	}

	/**
	 * Search and read expense records
	 * @param {any[]} domain
	 * @param {string[]} fields
	 * @returns {Promise<any[]>}
	 */
	async searchExpenses(domain = [], fields = []) {
		const result = await this.callApi('search', { domain, fields });
		return result.results;
	}

	/**
	 * Generic search_read for any model
	 * @param {string} model
	 * @param {any[]} domain
	 * @param {string[]} fields
	 * @returns {Promise<any[]>}
	 */
	async searchModel(model, domain = [], fields = []) {
		const result = await this.callApi('search_model', { model, domain, fields });
		return result.results;
	}

	/**
	 * Fetch common partner list (id and display name)
	 * @returns {Promise<Array<{id:number, display_name:string}>>}
	 */
	async fetchPartners() {
		// request id and display_name which is standard on res.partner
		return await this.searchModel('res.partner', [], ['id', 'display_name']);
	}

	/**
	 * Fetch default participants configured in x_expense_participants model.
	 * Expects a single record with field `x_studio_default_participants` containing partner ids.
	 * Returns Array<{id:number, display_name:string}> limited to the configured list.
	 * @deprecated Use fetchExpenseGroups() and fetchGroupMembers() instead
	 */
	async fetchDefaultParticipants() {
		// read the one configuration record
		const cfg = await this.searchModel('x_expense_participants', [], ['id', 'x_studio_default_participants']);
		if (!Array.isArray(cfg) || cfg.length === 0) return [];
		const first = cfg[0];
		const ids = (first.x_studio_default_participants || []).map(
			/** @param {any} i */ (i) => Number(i)
		);
		if (ids.length === 0) return [];
		// fetch partner display names for these ids
		return await this.searchModel('res.partner', [['id', 'in', ids]], ['id', 'display_name']);
	}

	/**
	 * Fetch all expense groups from x_expensegroup model
	 * @returns {Promise<Array<{id:number, display_name:string, x_studio_members:any}>>}
	 */
	async fetchExpenseGroups() {
		return await this.searchModel('x_expensegroup', [], ['id', 'display_name', 'x_studio_members']);
	}

	/**
	 * Fetch members of a specific expense group
	 * @param {number} groupId - The expense group ID
	 * @returns {Promise<Array<{id:number, display_name:string}>>}
	 */
	async fetchGroupMembers(groupId) {
		if (!groupId) return [];

		// Fetch the group record with members field
		const groups = await this.searchModel('x_expensegroup', [['id', '=', groupId]], ['id', 'x_studio_members']);

		if (!Array.isArray(groups) || groups.length === 0) return [];

		const group = groups[0];
		const memberIds = [];

		// Extract member IDs from the x_studio_members field
		// This could be in different formats: array of IDs, array of tuples, etc.
		if (Array.isArray(group.x_studio_members)) {
			for (const member of group.x_studio_members) {
				if (Array.isArray(member) && member.length > 0) {
					// Format: [id, "display_name"]
					memberIds.push(Number(member[0]));
				} else if (typeof member === 'number') {
					// Format: id
					memberIds.push(Number(member));
				}
			}
		}

		if (memberIds.length === 0) return [];

		// Fetch partner display names for these member IDs
		return await this.searchModel('res.partner', [['id', 'in', memberIds]], ['id', 'display_name']);
	}

	/**
	 * Helpers to format Odoo relational fields
	 */
	/**
	 * Format a many2one field value
	 * @param {number|string|null|undefined} id
	 * @returns {number|false}
	 */
	formatMany2one(id) {
		// many2one expects an integer id
		return id ? Number(id) : false;
	}

	/**
	 * Format a many2many field using the (6,0,[ids]) command
	 * @param {Array<number|string>} ids
	 * @returns {any[]}
	 */
	formatMany2many(ids) {
		// many2many 'commands' format: use (6, 0, [ids]) to replace with list of ids
		if (!Array.isArray(ids) || ids.length === 0) return [];
		// Odoo expects a list of command tuples. For JSON this is an array containing
		// the command array(s). For example: [[6, 0, [1,2]]]
		return [[6, 0, ids.map((i) => Number(i))]];
	}

	/**
	 * Update an expense record
	 * @param {number} id
	 * @param {Record<string, any>} values
	 * @returns {Promise<boolean>}
	 */
	async updateExpense(id, values) {
		const result = await this.callApi('update', { id, values });
		return result.result;
	}

	/**
	 * Delete an expense record
	 * @param {number} id
	 * @returns {Promise<boolean>}
	 */
	async deleteExpense(id) {
		const result = await this.callApi('delete', { id });
		return result.result;
	}

	/**
	 * Mark multiple expenses as done/settled
	 * @param {number[]} ids - Array of expense IDs to mark as done
	 * @returns {Promise<boolean>}
	 */
	async markExpensesAsDone(ids) {
		if (!Array.isArray(ids) || ids.length === 0) {
			return false;
		}

		// Update all expenses in parallel
		const updatePromises = ids.map(id => 
			this.updateExpense(id, { x_studio_is_done: true })
		);

		try {
			const results = await Promise.all(updatePromises);
			// Return true if all updates succeeded
			return results.every(result => result === true);
		} catch (error) {
			console.error('Failed to mark expenses as done:', error);
			return false;
		}
	}

	/**
	 * Mark multiple expenses as undone/unsettled
	 * @param {number[]} ids - Array of expense IDs to mark as undone
	 * @returns {Promise<boolean>}
	 */
	async markExpensesAsUndone(ids) {
		if (!Array.isArray(ids) || ids.length === 0) {
			return false;
		}

		// Update all expenses in parallel
		const updatePromises = ids.map(id => 
			this.updateExpense(id, { x_studio_is_done: false })
		);

		try {
			const results = await Promise.all(updatePromises);
			// Return true if all updates succeeded
			return results.every(result => result === true);
		} catch (error) {
			console.error('Failed to mark expenses as undone:', error);
			return false;
		}
	}
}

export const odooClient = new OdooAPI();
