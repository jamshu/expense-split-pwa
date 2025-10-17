import { json } from '@sveltejs/kit';
import {
	PUBLIC_ODOO_URL,
	PUBLIC_ODOO_DB,
	PUBLIC_ODOO_USERNAME,
	PUBLIC_ODOO_PASSWORD,
	PUBLIC_ODOO_API_KEY,
	PUBLIC_ODOO_EXPENSE_MODEL
} from '$env/static/public';

/** @type {number|null} */
let cachedUid = null;

/**
 * Make JSON-RPC call to Odoo
 * @param {string} service
 * @param {string} method
 * @param {any[]} args
 */
async function callOdoo(service, method, args) {
	const response = await fetch(`${PUBLIC_ODOO_URL}/jsonrpc`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'call',
			params: {
				service: service,
				method: method,
				args: args
			},
			id: Math.floor(Math.random() * 1000000)
		})
	});

	const data = await response.json();

	if (data.error) {
		throw new Error(data.error.data?.message || data.error.message || 'Odoo API Error');
	}

	return data.result;
}

/**
 * Authenticate with Odoo and get UID
 */
async function authenticate() {
	if (cachedUid) return cachedUid;

	const authMethod =
		PUBLIC_ODOO_API_KEY && PUBLIC_ODOO_API_KEY.trim() !== ''
			? PUBLIC_ODOO_API_KEY
			: PUBLIC_ODOO_PASSWORD;
	const uid = await callOdoo('common', 'login', [PUBLIC_ODOO_DB, PUBLIC_ODOO_USERNAME, authMethod]);

	if (!uid) {
		throw new Error('Authentication failed');
	}

	cachedUid = uid;
	return uid;
}

/**
 * Execute a method on Odoo model
 * @param {string} model
 * @param {string} method
 * @param {any[]} args
 * @param {Record<string, any>} kwargs
 */
async function execute(model, method, args = [], kwargs = {}) {
	const uid = await authenticate();
	const authMethod =
		PUBLIC_ODOO_API_KEY && PUBLIC_ODOO_API_KEY.trim() !== ''
			? PUBLIC_ODOO_API_KEY
			: PUBLIC_ODOO_PASSWORD;

	return await callOdoo('object', 'execute_kw', [
		PUBLIC_ODOO_DB,
		uid,
		authMethod,
		model,
		method,
		args,
		kwargs
	]);
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const { action, data } = await request.json();

		switch (action) {
			case 'create': {
				const id = await execute(PUBLIC_ODOO_EXPENSE_MODEL, 'create', [data]);
				return json({ success: true, id });
			}

			// Search any model (used by frontend to load res.partner list)
			case 'search_model': {
				const { model, domain = [], fields = [] } = data;
				const results = await execute(model, 'search_read', [domain], { fields });
				return json({ success: true, results });
			}

			case 'search': {
				const { domain = [], fields = [] } = data;
				const results = await execute(
					PUBLIC_ODOO_EXPENSE_MODEL,
					'search_read',
					[domain],
					{ fields }
				);
				return json({ success: true, results });
			}

			case 'update': {
				const { id, values } = data;
				const result = await execute(PUBLIC_ODOO_EXPENSE_MODEL, 'write', [[id], values]);
				return json({ success: true, result });
			}

			case 'delete': {
				const { id } = data;
				const result = await execute(PUBLIC_ODOO_EXPENSE_MODEL, 'unlink', [[id]]);
				return json({ success: true, result });
			}

			default:
				return json({ success: false, error: 'Invalid action' }, { status: 400 });
		}
	} catch (error) {
		console.error('Odoo API Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
