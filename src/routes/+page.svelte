<script>
	import { odooClient } from '$lib/odoo';
	import { onMount } from 'svelte';

	let description = '';
	let amount = '';
	let payer = '';
	let participants = []; // store selected partner ids
	let loading = false;
	let message = '';

	let partners = []; // loaded from Odoo (id, display_name)

	onMount(async () => {
		try {
			partners = await odooClient.fetchPartners();
		} catch (err) {
			console.error('Failed to load partners', err);
		}
	});

	async function handleSubmit() {
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
					// format many2one
					x_studio_who_paid: odooClient.formatMany2one(payer)
				};

				// format many2many if participants present
				const partsFormatted = odooClient.formatMany2many(participants);
				if (partsFormatted.length) payload.x_studio_participants = partsFormatted;

				// set date on payload
				payload.x_studio_date = new Date().toISOString().split('T')[0];

				await odooClient.createExpense(payload);

			message = '✅ Expense added successfully!';
			
			// Reset form
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
		<!-- expense type removed: not used -->

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
			<select id="payer" bind:value={payer} required>
				<option value="">-- Select payer --</option>
				{#each partners as p}
					<option value={p.id}>{p.display_name}</option>
				{/each}
			</select>
		</div>

		<div class="form-group">
			<label>Participants</label>
			<div class="checkbox-grid">
				{#each partners as p}
					<label class="checkbox-item">
						<input type="checkbox" bind:group={participants} value={p.id} />
						{p.display_name}
					</label>
				{/each}
			</div>
			<small>Tick participants who share this expense</small>
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
</style>
