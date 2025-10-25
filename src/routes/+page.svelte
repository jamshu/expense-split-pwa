<script>
	import { odooClient } from '$lib/odoo';
	import { expenseCache } from '$lib/stores/expenseCache';
	import { defaultGroup } from '$lib/stores/defaultGroup';
	import { onMount } from 'svelte';

	let description = '';
	let amount = '';
	let payer = '';
	let participants = []; // store selected partner ids
	let loading = false;
	let message = '';

	let expenseGroups = []; // list of expense groups
	let selectedGroup = ''; // selected expense group ID
	let partners = []; // loaded from Odoo (id, display_name) - members of selected group
	let showGroupSelector = false; // toggle for group selector

	onMount(async () => {
		try {
			// Load expense groups
			expenseGroups = await odooClient.fetchExpenseGroups();

			// Load default group from store
			const defaultGroupId = defaultGroup.get();

			if (defaultGroupId && expenseGroups.find(g => g.id === defaultGroupId)) {
				// Use saved default group
				selectedGroup = defaultGroupId;
				await loadGroupMembers(selectedGroup);
			} else if (expenseGroups.length === 1) {
				// If there's only one group, auto-select it and save as default
				selectedGroup = expenseGroups[0].id;
				defaultGroup.setDefault(selectedGroup);
				await loadGroupMembers(selectedGroup);
			} else if (expenseGroups.length > 1) {
				// Multiple groups, show selector if no default
				showGroupSelector = !defaultGroupId;
			}
		} catch (err) {
			console.error('Failed to load expense groups', err);
		}
	});

	async function loadGroupMembers(groupId) {
		if (!groupId) {
			partners = [];
			return;
		}

		try {
			loading = true;
			partners = await odooClient.fetchGroupMembers(groupId);

			// Reset payer and participants when group changes
			payer = '';
			participants = [];
		} catch (err) {
			console.error('Failed to load group members', err);
			message = `❌ Failed to load group members: ${err.message}`;
		} finally {
			loading = false;
		}
	}

	async function handleGroupChange() {
		// Save as default when group changes
		if (selectedGroup) {
			defaultGroup.setDefault(selectedGroup);
		}
		await loadGroupMembers(selectedGroup);
		showGroupSelector = false; // Hide selector after selection
	}

	function toggleGroupSelector() {
		showGroupSelector = !showGroupSelector;
	}

	async function handleSubmit() {
		if (!selectedGroup) {
			message = '⚠️ Please select an expense group';
			return;
		}

		if (!description || !amount || !payer || participants.length === 0) {
			message = '⚠️ Please fill all fields';
			return;
		}

		loading = true;
		message = '';

		try {
				const payload = {
					x_name: description,
					x_studio_value: parseFloat(amount),
					// format many2one for payer
					x_studio_who_paid: odooClient.formatMany2one(payer),
					// format many2one for expense group
					x_studio_expensegroup: odooClient.formatMany2one(selectedGroup)
				};

				// format many2many if participants present
				const partsFormatted = odooClient.formatMany2many(participants);
				if (partsFormatted.length) payload.x_studio_participants = partsFormatted;

				// set date on payload
				payload.x_studio_date = new Date().toISOString().split('T')[0];

			await odooClient.createExpense(payload);

		message = '✅ Expense added successfully!';

		// Immediately sync the expense cache to update balances
		expenseCache.sync();

		// Reset form (keep group selection)
		description = '';
		amount = '';
		payer = '';
		participants = [];
		} catch (error) {
			message = `❌ Error: ${error.message}`;
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Expense Split - Add Expense</title>
</svelte:head>

<div class="container">
	<h1>💰 Expense Split</h1>

	<nav>
		<a href="/" class="active">Add Expense</a>
		<a href="/balance">Balance Report</a>
	</nav>

	<form on:submit|preventDefault={handleSubmit}>
		<!-- Expense Group Display/Selector -->
		<div class="form-group">
			<div class="group-header">
				<label for="group">Expense Group</label>
				{#if selectedGroup && !showGroupSelector}
					<button type="button" class="switch-btn" on:click={toggleGroupSelector} title="Switch group">
						🔄 Switch
					</button>
				{/if}
			</div>
			{#if showGroupSelector || !selectedGroup}
				<select id="group" bind:value={selectedGroup} on:change={handleGroupChange} required>
					<option value="">-- Select expense group --</option>
					{#each expenseGroups as group}
						<option value={group.id}>{group.display_name}</option>
					{/each}
				</select>
				<small>Select the group for this expense</small>
			{:else}
				<div class="selected-group">
					{expenseGroups.find(g => g.id === selectedGroup)?.display_name || 'Unknown Group'}
				</div>
				<small>Default expense group</small>
			{/if}
		</div>

		<div class="form-group">
			<label for="description">Description</label>
			<input
				type="text"
				id="description"
				bind:value={description}
				placeholder="e.g., Weekly groceries"
				required
			/>
		</div>

		<div class="form-group">
			<label for="amount">Amount</label>
			<input
				type="number"
				id="amount"
				bind:value={amount}
				placeholder="0.00"
				step="0.01"
				min="0"
				required
			/>
		</div>

		<div class="form-group">
			<label for="payer">Who Paid?</label>
			<select id="payer" bind:value={payer} required disabled={!selectedGroup || partners.length === 0}>
				<option value="">-- Select payer --</option>
				{#each partners as p}
					<option value={p.id}>{p.display_name}</option>
				{/each}
			</select>
			{#if selectedGroup && partners.length === 0}
				<small class="warning">No members found in this group</small>
			{/if}
		</div>

		<div class="form-group">
			<label>Participants</label>
			{#if !selectedGroup}
				<small class="info">Please select an expense group first</small>
			{:else if partners.length === 0}
				<small class="warning">No members available in this group</small>
			{:else}
				<div class="checkbox-grid">
					{#each partners as p}
						<label class="checkbox-item">
							<input type="checkbox" bind:group={participants} value={p.id} />
							{p.display_name}
						</label>
					{/each}
				</div>
				<small>Tick participants who share this expense</small>
			{/if}
		</div>

		{#if message}
			<div class="message" class:error={message.includes('❌')}>{message}</div>
		{/if}

		<button type="submit" disabled={loading}>
			{loading ? '⏳ Adding...' : '➕ Add Expense'}
		</button>
	</form>
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
		max-width: 500px;
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

	form {
		background: white;
		padding: 30px;
		border-radius: 15px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
	}

	.form-group {
		margin-bottom: 20px;
	}

	.checkbox-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 8px;
		max-height: 200px;
		overflow: auto;
		padding: 6px 0;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		background: #fafafa;
		border: 1px solid #eee;
		font-size: 0.95em;
	}

	label {
		display: block;
		margin-bottom: 8px;
		font-weight: 600;
		color: #333;
	}

	input,
	select {
		width: 100%;
		padding: 12px;
		border: 2px solid #e0e0e0;
		border-radius: 8px;
		font-size: 16px;
		box-sizing: border-box;
		transition: border-color 0.3s;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: #667eea;
	}

	small {
		display: block;
		margin-top: 5px;
		color: #666;
		font-size: 0.85em;
	}

	button {
		width: 100%;
		padding: 15px;
		background: #667eea;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 18px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s;
	}

	button:hover:not(:disabled) {
		background: #5568d3;
		transform: translateY(-2px);
		box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.message {
		padding: 12px;
		border-radius: 8px;
		margin-bottom: 15px;
		background: #d4edda;
		color: #155724;
		text-align: center;
	}

	.message.error {
		background: #f8d7da;
		color: #721c24;
	}

	small.warning {
		color: #d97706;
		font-weight: 500;
	}

	small.info {
		color: #2563eb;
		font-weight: 500;
	}

	.group-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.switch-btn {
		background: #f0f0f0;
		color: #667eea;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		padding: 6px 12px;
		font-size: 0.85em;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s;
		width: auto;
	}

	.switch-btn:hover {
		background: #667eea;
		color: white;
		transform: none;
		box-shadow: none;
	}

	.selected-group {
		padding: 12px;
		background: #f8f9fa;
		border: 2px solid #667eea;
		border-radius: 8px;
		font-size: 16px;
		font-weight: 600;
		color: #333;
	}
</style>
