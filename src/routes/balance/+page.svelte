<script>
	import { onMount, onDestroy } from 'svelte';
	import { expenseCache, recentExpenses, cacheStatus } from '$lib/stores/expenseCache';
	import { odooClient } from '$lib/odoo';

	// Subscribe to cache store
	let expenses = [];
	let balances = {};
	let loading = false;
	let syncing = false;
	let error = '';
	let lastSync = 0;
	let isStale = false;

	let selectedParticipant = '';
	let showParticipantDetails = false;
	let showRefreshTooltip = false;

	// Group selection
	let expenseGroups = [];
	let selectedGroup = null;
	
	// Subscribe to cache updates
	const unsubscribeCache = expenseCache.subscribe($cache => {
		expenses = $cache.expenses;
		balances = $cache.balances;
		loading = $cache.loading;
		error = $cache.error;
	});
	
	const unsubscribeStatus = cacheStatus.subscribe($status => {
		syncing = $status.isSyncing;
		lastSync = $status.lastSync;
		isStale = $status.isStale;
	});
	
	onMount(async () => {
		// Load expense groups first
		try {
			expenseGroups = await odooClient.fetchExpenseGroups();

			// If there's only one group, auto-select it
			if (expenseGroups.length === 1) {
				selectedGroup = expenseGroups[0].id;
				await expenseCache.setGroupFilter(selectedGroup);
			}
		} catch (err) {
			console.error('Failed to load expense groups', err);
			error = 'Failed to load expense groups';
		}

		// Initialize cache store - will show cached data immediately
		// and sync in background if needed
		await expenseCache.initialize();
	});

	async function handleGroupChange() {
		if (selectedGroup) {
			await expenseCache.setGroupFilter(selectedGroup);
		}
	}
	
	onDestroy(() => {
		// Clean up subscriptions and background sync
		unsubscribeCache();
		unsubscribeStatus();
		expenseCache.destroy();
	});
	
	// Manual refresh function
	async function handleRefresh() {
		showRefreshTooltip = false;
		await expenseCache.forceRefresh();
	}
	
	// Format last sync time
	function formatLastSync(timestamp) {
		if (!timestamp) return 'Never';
		
		const now = Date.now();
		const diff = now - timestamp;
		
		if (diff < 60000) return 'Just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
		return `${Math.floor(diff / 86400000)}d ago`;
	}

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

	// Filter expenses by settlement status
	function getSettledExpenses() {
		return expenses.filter(e => e.x_studio_is_done === true);
	}

	function getUnsettledExpenses() {
		return expenses.filter(e => e.x_studio_is_done !== true);
	}

	function getParticipantPayments(person, settled = false) {
		const expenseList = settled ? getSettledExpenses() : getUnsettledExpenses();
		return expenseList.filter(e => e.x_studio_who_paid === person);
	}

	function getParticipantExpenses(person, settled = false) {
		const expenseList = settled ? getSettledExpenses() : getUnsettledExpenses();
		return expenseList.filter(e => Array.isArray(e.x_studio_participants) && e.x_studio_participants.includes(person));
	}

	function getSumPayments(person, settled = false) {
		return getParticipantPayments(person, settled).reduce((sum, e) => sum + (e.x_studio_value || 0), 0);
	}

	function getSumIndividualShares(person, settled = false) {
		return getParticipantExpenses(person, settled).reduce((sum, e) => {
			const n = Array.isArray(e.x_studio_participants) ? e.x_studio_participants.length : 0;
			return sum + (n > 0 ? (e.x_studio_value || 0) / n : 0);
		}, 0);
	}

	// Calculate opening balance from settled expenses
	function getOpeningBalance(person) {
		return getSumPayments(person, true) - getSumIndividualShares(person, true);
	}

	function closeParticipantDetails() {
		showParticipantDetails = false;
	}

	function formatDate(dateString) {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Expense Split - Balance Report</title>
</svelte:head>

<div class="container">
	<h1>📊 Balance Report</h1>

	<!-- Navigation -->
	<nav>
		<a href="/">Add Expense</a>
		<a href="/balance" class="active">Balance Report</a>
	</nav>

	<!-- Group Selection -->
	<div class="group-selector">
		<label for="group-filter">Expense Group:</label>
		<select id="group-filter" bind:value={selectedGroup} on:change={handleGroupChange}>
			<option value={null}>-- Select a group --</option>
			{#each expenseGroups as group}
				<option value={group.id}>{group.display_name}</option>
			{/each}
		</select>
	</div>

	{#if !selectedGroup}
		<div class="info-message">
			Please select an expense group to view balances
		</div>
	{:else}

	<!-- Cache Status Bar -->
	<div class="cache-status-bar">
		<div class="cache-info">
			{#if syncing}
				<span class="sync-indicator">
					<span class="sync-spinner"></span>
					Syncing...
				</span>
			{:else if isStale}
				<span class="cache-badge stale">⚠️ Stale cache</span>
			{:else}
				<span class="cache-badge fresh">✓ Up to date</span>
			{/if}
			
			<span class="last-sync">
				Last sync: {formatLastSync(lastSync)}
			</span>
		</div>
		
		<button 
			class="refresh-btn" 
			on:click={handleRefresh}
			on:mouseenter={() => showRefreshTooltip = true}
			on:mouseleave={() => showRefreshTooltip = false}
			disabled={syncing}
		>
			🔄
			{#if showRefreshTooltip}
				<span class="tooltip">Force refresh</span>
			{/if}
		</button>
	</div>

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
						<div class="balance-item" class:positive={balance > 0} class:negative={balance < 0} on:click={() => openParticipantDetails(person)} on:keydown={(e) => e.key === 'Enter' && openParticipantDetails(person)} role="button" tabindex="0">
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
			{/if}
		</div>

		{#if showParticipantDetails}
			<div class="modal-bg" on:click={closeParticipantDetails} on:keydown={(e) => e.key === 'Escape' && closeParticipantDetails()} role="button" tabindex="0"></div>
			<div class="participant-modal">
				<div class="modal-header">
					<h3>💼 Details for <span class="person">{selectedParticipant}</span></h3>
					<button class="close-btn" on:click={closeParticipantDetails}>✕</button>
				</div>

				<div class="modal-content">
					<!-- Summary Section -->
					<div class="participant-summary">
						<div class="summary-grid">
							{#if getOpeningBalance(selectedParticipant) !== 0}
								<div><strong>Opening Balance (from settled):</strong></div>
								<div class="amount {getOpeningBalance(selectedParticipant) >= 0 ? 'green' : 'red'}">
									{formatCurrency(getOpeningBalance(selectedParticipant))}
								</div>
							{/if}
							
							<div><strong>Current Credits (Owed to {selectedParticipant}):</strong></div>
							<div class="amount green">{formatCurrency(getSumPayments(selectedParticipant, false))}</div>
							
							<div><strong>Current Debits (Owed by {selectedParticipant}):</strong></div>
							<div class="amount red">-{formatCurrency(getSumIndividualShares(selectedParticipant, false))}</div>
							
							<div class="net-balance"><strong>Net Balance:</strong></div>
							<div class="amount {getSumPayments(selectedParticipant, false) - getSumIndividualShares(selectedParticipant, false) + getOpeningBalance(selectedParticipant) >= 0 ? 'green' : 'red'}">
								{formatCurrency(getSumPayments(selectedParticipant, false) - getSumIndividualShares(selectedParticipant, false) + getOpeningBalance(selectedParticipant))}
							</div>
						</div>
					</div>

				<div class="participant-section">
					<h4>Credits (Amount Owed to {selectedParticipant})</h4>
					{#if getUnsettledExpenses().filter(e => e.x_studio_who_paid === selectedParticipant).length === 0}
						<p class="empty">No current credits for this participant.</p>
					{:else}
						<div class="table-container">
							<table class="data-table">
								<thead>
									<tr>
										<th>Date</th>
										<th>Description</th>
										<th class="text-right">Amount</th>
									</tr>
								</thead>
								<tbody>
									{#each [...getUnsettledExpenses().filter(e => e.x_studio_who_paid === selectedParticipant)].reverse() as expense}
										<tr>
											<td>{formatDate(expense.x_studio_date)}</td>
											<td>{expense.x_name}</td>
											<td class="text-right">{formatCurrency(expense.x_studio_value)}</td>
										</tr>
									{/each}
								</tbody>
								<tfoot>
									<tr class="total-row">
										<td colspan="2" class="text-right"><strong>Total Credits:</strong></td>
										<td class="text-right"><strong class="green">{formatCurrency(getSumPayments(selectedParticipant, false))}</strong></td>
									</tr>
								</tfoot>
							</table>
						</div>
					{/if}
				</div>

				{#if getUnsettledExpenses().filter(e => Array.isArray(e.x_studio_participants) && e.x_studio_participants.includes(selectedParticipant)).length > 0}
					<div class="participant-section">
						<h4>Debits (Amount Owed by {selectedParticipant})</h4>
						<div class="table-container">
							<table class="data-table">
								<thead>
									<tr>
										<th>Date</th>
										<th>Description</th>
										<th class="text-right">Total</th>
										<th class="text-right">Your Share</th>
									</tr>
								</thead>
								<tbody>
									{#each [...getUnsettledExpenses().filter(e => Array.isArray(e.x_studio_participants) && e.x_studio_participants.includes(selectedParticipant))].reverse() as expense}
										{@const share = expense.x_studio_participants && Array.isArray(expense.x_studio_participants) && expense.x_studio_participants.length > 0 ? expense.x_studio_value / expense.x_studio_participants.length : 0}
										<tr>
											<td>{formatDate(expense.x_studio_date)}</td>
											<td>{expense.x_name} (Paid by: {expense.x_studio_who_paid})</td>
											<td class="text-right">{formatCurrency(expense.x_studio_value)}</td>
											<td class="text-right">{formatCurrency(share)}</td>
										</tr>
									{/each}
								</tbody>
								<tfoot>
									<tr class="total-row">
										<td colspan="3" class="text-right"><strong>Total Debits:</strong></td>
										<td class="text-right"><strong class="red">-{formatCurrency(getSumIndividualShares(selectedParticipant, false))}</strong></td>
									</tr>
								</tfoot>
							</table>
						</div>
					</div>
				{/if}
				</div>
			</div>
		{/if}

		<div class="report-card">
			<h2>📝 Recent Unsettled Expenses</h2>
			{#if getUnsettledExpenses().length === 0}
				<p class="empty">No unsettled expenses.</p>
			{:else}
				<div class="expense-list">
					{#each getUnsettledExpenses().slice(-10).reverse() as expense}
						<div class="expense-item">
							<div class="expense-header">
								<span class="expense-type">{expense.x_studio_type === 'grocery' ? '🛒' : expense.x_studio_type === 'hotel' ? '🏨' : '📦'}</span>
								<span class="expense-name">{expense.x_name}</span>
								<span class="expense-amount">{formatCurrency(expense.x_studio_value)}</span>
							</div>
							<div class="expense-details">
								<span>Date: <strong>{expense.x_studio_date}</strong></span>
								<span>Paid by: <strong>{expense.x_studio_who_paid}</strong></span>
								<span>Split: {expense.x_studio_participants}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
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

	.group-selector {
		background: white;
		padding: 20px;
		border-radius: 15px;
		margin-bottom: 20px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
	}

	.group-selector label {
		display: block;
		margin-bottom: 10px;
		font-weight: 600;
		color: #333;
	}

	.group-selector select {
		width: 100%;
		padding: 12px;
		border: 2px solid #e0e0e0;
		border-radius: 8px;
		font-size: 1em;
		background: white;
		cursor: pointer;
		transition: border-color 0.3s;
	}

	.group-selector select:focus {
		outline: none;
		border-color: #667eea;
	}

	.info-message {
		background: white;
		padding: 30px;
		border-radius: 15px;
		text-align: center;
		color: #666;
		font-size: 1.1em;
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
		cursor: pointer;
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
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		z-index: 100;
		animation: fadeIn 0.2s ease-out;
		cursor: pointer;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			transform: translate(-50%, -40%);
			opacity: 0;
		}
		to {
			transform: translate(-50%, -50%);
			opacity: 1;
		}
	}

	.participant-modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: white;
		padding: 0;
		border-radius: 20px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		z-index: 101;
		min-width: 400px;
		max-width: 90vw;
		max-height: 85vh;
		overflow: hidden;
		animation: slideUp 0.3s ease-out;
	}

	.modal-header {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 25px 30px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-radius: 20px 20px 0 0;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.5em;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.modal-header .person {
		color: white;
	}

	.modal-content {
		max-height: calc(85vh - 80px);
		overflow-y: auto;
		padding: 20px 30px 30px 30px;
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
		background: rgba(255, 255, 255, 0.2);
		color: white;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		width: 36px;
		height: 36px;
		font-size: 1.2em;
		cursor: pointer;
		transition: all 0.3s;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.3);
		transform: rotate(90deg);
	}
	
	/* Cache status bar styles */
	.cache-status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: rgba(255, 255, 255, 0.95);
		padding: 10px 15px;
		border-radius: 10px;
		margin-bottom: 20px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
	}
	
	.cache-info {
		display: flex;
		align-items: center;
		gap: 15px;
		font-size: 0.9em;
	}
	
	.cache-badge {
		padding: 4px 10px;
		border-radius: 12px;
		font-weight: 600;
		font-size: 0.85em;
	}
	
	.cache-badge.fresh {
		background: #e8f5e9;
		color: #2e7d32;
	}
	
	.cache-badge.stale {
		background: #fff3e0;
		color: #ef6c00;
	}
	
	.sync-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #667eea;
		font-weight: 600;
	}
	
	.sync-spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid rgba(102, 126, 234, 0.3);
		border-top-color: #667eea;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	
	.last-sync {
		color: #666;
		font-size: 0.9em;
	}
	
	.refresh-btn {
		position: relative;
		background: #667eea;
		color: white;
		border: none;
		border-radius: 50%;
		width: 36px;
		height: 36px;
		font-size: 1.2em;
		cursor: pointer;
		transition: all 0.3s;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.refresh-btn:hover:not(:disabled) {
		background: #5568d3;
		transform: rotate(180deg);
	}
	
	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.tooltip {
		position: absolute;
		top: -35px;
		right: 0;
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 5px 10px;
		border-radius: 6px;
		font-size: 0.85em;
		white-space: nowrap;
		pointer-events: none;
	}

	.participant-summary {
		margin-bottom: 20px;
		padding: 15px;
		background: #f8f9fa;
		border-radius: 10px;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
		align-items: center;
	}

	.net-balance {
		padding-top: 10px;
		border-top: 2px solid #ddd;
		margin-top: 10px;
	}

	.table-container {
		overflow-x: auto;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 10px;
	}

	.data-table th,
	.data-table td {
		padding: 10px;
		text-align: left;
		border-bottom: 1px solid #e0e0e0;
	}

	.data-table th {
		background: #f5f5f5;
		font-weight: 600;
		color: #333;
	}

	.data-table .text-right {
		text-align: right;
	}

	.data-table tfoot {
		border-top: 2px solid #ddd;
	}

	.total-row td {
		padding-top: 15px;
		font-weight: 600;
	}
</style>