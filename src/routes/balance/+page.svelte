<script>
	import { onMount } from 'svelte';
	import { odooClient } from '$lib/odoo';
	import { calculateBalances, calculateSettlements } from '$lib/expenseUtils';

	let loading = true;
	let error = '';
	let expenses = [];
	let balances = {};
	let settlements = [];

	let selectedParticipant = '';
	let showParticipantDetails = false;

	onMount(async () => {
		try {
			expenses = await odooClient.searchExpenses([], [
				'x_name',
				'x_studio_value',
				'x_studio_who_paid',
				'x_studio_participants',
				'x_studio_type',
				'x_studio_date'
			]);

			// Resolve partner ids to display names so the report shows names (not raw ids)
			try {
				// collect partner ids from who_paid and participants
				const partnerIds = new Set();
				for (const e of expenses) {
					// who_paid: could be [id, name], object, or id
					if (Array.isArray(e.x_studio_who_paid) && e.x_studio_who_paid.length > 0) {
						partnerIds.add(Number(e.x_studio_who_paid[0]));
					} else if (e.x_studio_who_paid && typeof e.x_studio_who_paid === 'number') {
						partnerIds.add(Number(e.x_studio_who_paid));
					} else if (e.x_studio_who_paid && typeof e.x_studio_who_paid === 'string' && /^\d+$/.test(e.x_studio_who_paid)) {
						partnerIds.add(Number(e.x_studio_who_paid));
					}

					// participants: may be array of ids, array of tuples, or comma string
					const parts = e.x_studio_participants;
					if (Array.isArray(parts)) {
						for (const p of parts) {
							if (Array.isArray(p) && p.length > 0) partnerIds.add(Number(p[0]));
							else if (typeof p === 'number') partnerIds.add(Number(p));
							else if (typeof p === 'string' && /^\d+$/.test(p)) partnerIds.add(Number(p));
						}
					}
				}

				if (partnerIds.size > 0) {
					const ids = Array.from(partnerIds);
					const partners = await odooClient.searchModel('res.partner', [['id', 'in', ids]], ['id', 'display_name']);
					const partnerMap = new Map(partners.map((p) => [Number(p.id), p.display_name]));

					// replace ids in expenses with display names where possible
					expenses = expenses.map((e) => {
						const copy = { ...e };
						// who_paid
						if (Array.isArray(copy.x_studio_who_paid) && copy.x_studio_who_paid.length > 0) {
							const id = Number(copy.x_studio_who_paid[0]);
							copy.x_studio_who_paid = partnerMap.get(id) || String(copy.x_studio_who_paid[1] || id);
						} else if (typeof copy.x_studio_who_paid === 'number' || (typeof copy.x_studio_who_paid === 'string' && /^\d+$/.test(copy.x_studio_who_paid))) {
							const id = Number(copy.x_studio_who_paid);
							copy.x_studio_who_paid = partnerMap.get(id) || String(id);
						}

						// participants
						const parts = copy.x_studio_participants;
						if (Array.isArray(parts)) {
							const names = [];
							for (const p of parts) {
								if (Array.isArray(p) && p.length > 0) {
									const id = Number(p[0]);
									names.push(partnerMap.get(id) || String(p[1] || id));
								} else if (typeof p === 'number' || (typeof p === 'string' && /^\d+$/.test(p))) {
									const id = Number(p);
									names.push(partnerMap.get(id) || String(id));
								} else if (typeof p === 'object' && p) {
									names.push(String(p.display_name || p.name || p.id || JSON.stringify(p)));
								} else {
									names.push(String(p));
								}
							}
							copy.x_studio_participants = names;
						} else if (typeof parts === 'string') {
							// leave as-is (comma-separated names)
						}

						return copy;
					});
				}
			} catch (mapErr) {
				console.warn('Failed to map partner ids to names', mapErr);
			}

			balances = calculateBalances(expenses);
			settlements = calculateSettlements(balances);
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	});

	function formatCurrency(amount) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'SAR'
		}).format(amount);
	}


	function openParticipantDetails(person) {
		selectedParticipant = person;
		showParticipantDetails = true;
	}

	function getParticipantPayments(person) {
		return expenses.filter(e => e.x_studio_who_paid === person);
	}

	function getParticipantExpenses(person) {
		return expenses.filter(e => Array.isArray(e.x_studio_participants) && e.x_studio_participants.includes(person));
	}

	function getSumPayments(person) {
		return getParticipantPayments(person).reduce((sum, e) => sum + (e.x_studio_value || 0), 0);
	}

	function getSumIndividualShares(person) {
		return getParticipantExpenses(person).reduce((sum, e) => {
			const n = Array.isArray(e.x_studio_participants) ? e.x_studio_participants.length : 0;
			return sum + (n > 0 ? (e.x_studio_value || 0) / n : 0);
		}, 0);
	}

	function closeParticipantDetails() {
		showParticipantDetails = false;
	}
</script>

<svelte:head>
	<title>Expense Split - Balance Report</title>
</svelte:head>

<div class="container">
	<h1>📊 Balance Report</h1>

	<nav>
		<a href="/">Add Expense</a>
		<a href="/balance" class="active">Balance Report</a>
	</nav>

	{#if loading}
		<div class="loading">⏳ Loading...</div>
	{:else if error}
		<div class="error-box">❌ Error: {error}</div>
	{:else}
		<div class="report-card">
			<h2>💵 Individual Balances</h2>
			{#if Object.keys(balances).length === 0}
				<p class="empty">No expenses recorded yet.</p>
			{:else}
				<div class="balance-list">
					{#each Object.entries(balances) as [person, balance]}
						<div class="balance-item" class:positive={balance > 0} class:negative={balance < 0} on:click={() => openParticipantDetails(person)} style="cursor:pointer;">
							<span class="person">{person}</span>
							<span class="amount" class:green={balance > 0} class:red={balance < 0}>
								{formatCurrency(Math.abs(balance))}
								{#if balance > 0}
									<span class="badge green">owed</span>
								{:else if balance < 0}
									<span class="badge red">owes</span>
								{:else}
									<span class="badge gray">settled</span>
								{/if}
							</span>
						</div>
					{/each}
				</div>

					{#if showParticipantDetails}
						<div class="modal-bg" on:click={closeParticipantDetails}></div>
						<div class="participant-modal">
							<h3>Details for <span class="person">{selectedParticipant}</span></h3>
							<button class="close-btn" on:click={closeParticipantDetails}>Close</button>

							<!-- Summary Section -->
							<div class="participant-summary">
								<p><strong>Total Payments:</strong> {formatCurrency(getSumPayments(selectedParticipant))}</p>
								<p><strong>Total Individual Expense:</strong> {formatCurrency(getSumIndividualShares(selectedParticipant))}</p>
								<p><strong>Net Balance:</strong> {formatCurrency(getSumPayments(selectedParticipant) - getSumIndividualShares(selectedParticipant))}</p>
							</div>

							<div class="participant-section">
							<h4>Payments made by {selectedParticipant}</h4>
							{#if expenses.filter(e => e.x_studio_who_paid === selectedParticipant).length === 0}
								<p class="empty">No payments made by this participant.</p>
							{:else}
													<ul>
														{#each [...expenses.filter(e => e.x_studio_who_paid === selectedParticipant)].reverse() as expense}
																	<li>
																		{expense.x_name} — {formatCurrency(expense.x_studio_value)} ({expense.x_studio_date})
																	</li>
									{/each}
								</ul>
							{/if}
						</div>
						<div class="participant-section">
							<h4>Expenses including {selectedParticipant}</h4>
							{#if expenses.filter(e => Array.isArray(e.x_studio_participants) && e.x_studio_participants.includes(selectedParticipant)).length === 0}
								<p class="empty">No expenses include this participant.</p>
							{:else}
													<ul>
														{#each [...expenses.filter(e => Array.isArray(e.x_studio_participants) && e.x_studio_participants.includes(selectedParticipant))].reverse() as expense}
																	<li>
																		{expense.x_name} — {formatCurrency(expense.x_studio_value)} ({expense.x_studio_date},{formatCurrency(expense.x_studio_participants && Array.isArray(expense.x_studio_participants) && expense.x_studio_participants.length > 0 ? expense.x_studio_value / expense.x_studio_participants.length : 0)})
																	</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<div class="report-card">
			<h2>🔄 Settlement Plan</h2>
			{#if settlements.length === 0}
				<p class="empty">All balanced! No settlements needed.</p>
			{:else}
				<div class="settlement-list">
					{#each settlements as settlement}
						<div class="settlement-item">
							<div class="settlement-text">
								<strong>{settlement.from}</strong> pays
								<strong>{settlement.to}</strong>
							</div>
							<div class="settlement-amount">{formatCurrency(settlement.amount)}</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="report-card">
			<h2>📝 Recent Expenses</h2>
			{#if expenses.length === 0}
				<p class="empty">No expenses recorded yet.</p>
			{:else}
				<div class="expense-list">
					{#each expenses.slice(-10).reverse() as expense}
						<div class="expense-item">
							<div class="expense-header">
								<span class="expense-type">{expense.x_studio_type === 'grocery' ? '🛒' : expense.x_studio_type === 'hotel' ? '🏨' : '📦'}</span>
								<span class="expense-name">{expense.x_name}</span>
								<span class="expense-amount">{formatCurrency(expense.x_studio_value)}</span>
							</div>
							<div class="expense-details">
								<span>Paid by: <strong>{expense.x_studio_who_paid}</strong></span>
								<span>Split: {expense.x_studio_participants}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu,
			Cantarell, 'Helvetica Neue', sans-serif;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		min-height: 100vh;
	}

	.container {
		max-width: 600px;
		margin: 0 auto;
		padding: 20px;
	}

	h1 {
		color: white;
		text-align: center;
		margin-bottom: 30px;
		font-size: 2.5em;
	}

	nav {
		display: flex;
		gap: 10px;
		margin-bottom: 30px;
		background: white;
		border-radius: 10px;
		padding: 5px;
	}

	nav a {
		flex: 1;
		text-align: center;
		padding: 12px;
		text-decoration: none;
		color: #667eea;
		border-radius: 8px;
		font-weight: 600;
		transition: all 0.3s;
	}

	nav a.active {
		background: #667eea;
		color: white;
	}

	.loading,
	.error-box {
		background: white;
		padding: 30px;
		border-radius: 15px;
		text-align: center;
		font-size: 1.2em;
	}

	.error-box {
		color: #d32f2f;
	}

	.report-card {
		background: white;
		padding: 25px;
		border-radius: 15px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
		margin-bottom: 20px;
	}

	h2 {
		margin-top: 0;
		margin-bottom: 20px;
		color: #333;
		font-size: 1.5em;
	}

	.empty {
		text-align: center;
		color: #999;
		padding: 20px;
	}

	.balance-list,
	.settlement-list,
	.expense-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.balance-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 15px;
		background: #f8f9fa;
		border-radius: 10px;
		transition: transform 0.2s;
	}

	.balance-item:hover {
		transform: translateX(5px);
	}

	.person {
		font-weight: 600;
		font-size: 1.1em;
	}

	.amount {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
		font-size: 1.1em;
	}

	.amount.green {
		color: #4caf50;
	}

	.amount.red {
		color: #f44336;
	}

	.badge {
		padding: 4px 10px;
		border-radius: 12px;
		font-size: 0.75em;
		font-weight: 600;
		text-transform: uppercase;
	}

	.badge.green {
		background: #e8f5e9;
		color: #2e7d32;
	}

	.badge.red {
		background: #ffebee;
		color: #c62828;
	}

	.badge.gray {
		background: #e0e0e0;
		color: #616161;
	}

	.settlement-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 15px;
		background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
		border-radius: 10px;
		border-left: 4px solid #667eea;
	}

	.settlement-text {
		color: #333;
	}

	.settlement-amount {
		font-weight: 700;
		font-size: 1.2em;
		color: #667eea;
	}

	.expense-item {
		padding: 15px;
		background: #f8f9fa;
		border-radius: 10px;
		border-left: 4px solid #667eea;
	}

	.expense-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}

	.expense-type {
		font-size: 1.5em;
	}

	.expense-name {
		flex: 1;
		font-weight: 600;
		color: #333;
	}

	.expense-amount {
		font-weight: 700;
		color: #667eea;
	}

	.expense-details {
		display: flex;
		gap: 20px;
		font-size: 0.9em;
		color: #666;
		flex-wrap: wrap;
	}

	/* Modal styles */
	.modal-bg {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.3);
		z-index: 100;
	}

	.participant-modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: white;
		padding: 30px;
		border-radius: 15px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
		z-index: 101;
		min-width: 320px;
		max-width: 90vw;
		max-height: 80vh;
		overflow-y: auto;
	}

	.participant-modal h3 {
		margin-top: 0;
		margin-bottom: 10px;
	}

	.participant-section {
		margin-bottom: 20px;
	}

	.participant-section h4 {
		margin-bottom: 10px;
		color: #667eea;
	}

	.participant-section ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.participant-section li {
		padding: 8px 12px;
		background: #f8f9fa;
		border-radius: 6px;
		margin-bottom: 8px;
	}

	.close-btn {
		float: right;
		background: #667eea;
		color: white;
		border: none;
		border-radius: 8px;
		padding: 6px 16px;
		font-size: 1em;
		cursor: pointer;
		margin-bottom: 10px;
	}

	.close-btn:hover {
		background: #5568d3;
	}
</style>