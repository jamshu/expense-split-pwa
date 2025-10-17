// @ts-check

/**
 * Normalize a person field which may be a string, number, or [id, name] tuple or object.
 * Returns a display string to be used as the key in balances map.
 * @param {any} person
 * @returns {string}
 */
function normalizePerson(person) {
	if (person == null) return '';
	// If person is an array/tuple like [id, name]
	if (Array.isArray(person) && person.length >= 2) return String(person[1]);
	// If person is an object with display_name
	if (typeof person === 'object') {
		if (person.display_name) return String(person.display_name);
		if (person.name) return String(person.name);
	}
	// Primitive fallback
	return String(person);
}

/**
 * Normalize participants field into an array of display strings.
 * Accepts:
 * - comma separated string 'Alice, Bob'
 * - array of ids [1,2,3]
 * - array of tuples [[1,'Alice'], [2,'Bob']]
 * - array of objects [{id:1, display_name:'Alice'}]
 * @param {any} raw
 * @returns {string[]}
 */
function normalizeParticipants(raw) {
	if (!raw) return [];
	// comma-separated string
	if (typeof raw === 'string') {
		return raw.split(',').map((s) => s.trim()).filter(Boolean);
	}

	if (Array.isArray(raw)) {
		// array of tuples or objects or ids
		const results = [];
		for (const item of raw) {
			if (Array.isArray(item) && item.length >= 2) {
				results.push(String(item[1]));
			} else if (item && typeof item === 'object') {
				if (item.display_name) results.push(String(item.display_name));
				else if (item.name) results.push(String(item.name));
				else if (item.id) results.push(String(item.id));
			} else if (item != null) {
				// primitive id or string
				results.push(String(item));
			}
		}
		return results.filter(Boolean);
	}

	// fallback
	return [String(raw)];
}

/**
 * Calculate balances from expenses
 * @param {Array<{x_studio_who_paid: any, x_studio_value: number, x_studio_participants: any}>} expenses
 * @returns {Record<string, number>}
 */
export function calculateBalances(expenses) {
	/** @type {Record<string, number>} */
	const balances = {};

	for (const expense of expenses) {
		const rawPayer = expense.x_studio_who_paid;
	const amount = parseFloat(String(expense.x_studio_value || 0));

		// Normalize payer to a display string (if it's [id, name] tuple use name,
		// if it's a number or id string use that string; if it's an object fallback to toString)
		const payer = normalizePerson(rawPayer);

		// Normalize participants which can be:
		// - comma-separated string (legacy behavior)
		// - array of ids: [1,2,3]
		// - array of tuples: [[1, 'Alice'], [2, 'Bob']]
		const participants = normalizeParticipants(expense.x_studio_participants);

		if (!payer || participants.length === 0 || amount <= 0) continue;

		// Initialize balances
		if (!balances[payer]) balances[payer] = 0;
		participants.forEach((p) => {
			if (!balances[p]) balances[p] = 0;
		});

		// Payer gets credited
		balances[payer] += amount;

		// Split amount among participants
		const sharePerPerson = amount / participants.length;
		participants.forEach((p) => {
			balances[p] -= sharePerPerson;
		});
	}

	return balances;
}

/**
 * Calculate settlements (who owes whom)
 * @param {Record<string, number>} balances
 * @returns {Array<{from: string, to: string, amount: number}>}
 */
export function calculateSettlements(balances) {
	const creditors = [];
	const debtors = [];

	for (const [person, balance] of Object.entries(balances)) {
		if (balance > 0.01) {
			creditors.push({ person, amount: balance });
		} else if (balance < -0.01) {
			debtors.push({ person, amount: -balance });
		}
	}

	const settlements = [];

	let i = 0;
	let j = 0;

	while (i < creditors.length && j < debtors.length) {
		const creditor = creditors[i];
		const debtor = debtors[j];

		const amount = Math.min(creditor.amount, debtor.amount);

		settlements.push({
			from: debtor.person,
			to: creditor.person,
			amount: parseFloat(amount.toFixed(2))
		});

		creditor.amount -= amount;
		debtor.amount -= amount;

		if (creditor.amount < 0.01) i++;
		if (debtor.amount < 0.01) j++;
	}

	return settlements;
}
