// @ts-check
import { base } from '$app/paths';

/**
 * @typedef {Object} OdooClient
 * @property {(fields: Record<string, any>) => Promise<number>} createExpense
 * @property {(domain?: any[], fields?: string[]) => Promise<any[]>} searchExpenses
 * @property {(id: number, values: Record<string, any>) => Promise<boolean>} updateExpense
 * @property {(id: number) => Promise<boolean>} deleteExpense
 */

class OdooAPI {
	constructor() {
		this.apiUrl = `${base}/api/odoo`;
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
}

export const odooClient = new OdooAPI();
