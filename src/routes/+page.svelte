<script>
	import { odooClient } from '$lib/odoo';
	import { offlineExpenseCache as expenseCache } from '$lib/stores/offlineExpenseCache';
	import { groupCache } from '$lib/stores/groupCache';
	import { defaultGroup } from '$lib/stores/defaultGroup';
	import { getAll, STORES } from '$lib/db';
	import { onMount, onDestroy } from 'svelte';
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
	let isOffline = !navigator.onLine; // track online/offline status

	// Listen for online/offline events
	if (typeof window !== 'undefined') {
		window.addEventListener('online', () => { isOffline = false; });
		window.addEventListener('offline', () => { isOffline = true; });
	}

	// Subscribe to group cache
	const unsubscribeGroups = groupCache.subscribe($groupCache => {
		if ($groupCache.groups && $groupCache.groups.length > 0) {
			expenseGroups = $groupCache.groups;
			
			// Auto-select group if needed
			if (!selectedGroup) {
				const defaultGroupId = defaultGroup.get();
				
				if (defaultGroupId && expenseGroups.find(g => g.id === defaultGroupId)) {
					selectedGroup = defaultGroupId;
					loadGroupMembers(selectedGroup);
				} else if (expenseGroups.length === 1) {
					selectedGroup = expenseGroups[0].id;
					defaultGroup.setDefault(selectedGroup);
					loadGroupMembers(selectedGroup);
				} else if (expenseGroups.length > 1) {
					showGroupSelector = !defaultGroupId;
				}
			}
		}
	});

	onMount(async () => {
		// Initialize group cache (loads from IndexedDB or fetches if needed)
		await groupCache.initialize();
	});
	
	onDestroy(() => {
		unsubscribeGroups();
	});

	async function loadGroupMembers(groupId) {
		if (!groupId) {
			partners = [];
			return;
		}

		try {
			loading = true;
			message = ''; // Clear any previous messages
			
			// Find the group in cached groups
			const group = expenseGroups.find(g => g.id === groupId);
			console.log('Loading members for group:', groupId, 'Found:', group);
			
			if (group && group.x_studio_members && Array.isArray(group.x_studio_members)) {
				console.log('Group members:', group.x_studio_members);
				
				// Load all partners from IndexedDB to resolve names and default status
				const cachedPartners = await getAll(STORES.PARTNERS);
				const partnerMap = new Map(cachedPartners.map(p => [Number(p.id), p]));
				console.log('Cached partners:', partnerMap);

				// Extract member IDs and resolve names
				const memberIds = [];
				for (const member of group.x_studio_members) {
					let partnerId, partnerName, isDefault;

					if (Array.isArray(member) && member.length >= 2) {
						// Format: [id, "display_name"]
						partnerId = Number(member[0]);
						partnerName = String(member[1]);
						// Get x_studio_is_default from cache
						const cachedPartner = partnerMap.get(partnerId);
						isDefault = cachedPartner?.x_studio_is_default || false;
					} else if (typeof member === 'number') {
						// Just ID - resolve from partner cache
						partnerId = Number(member);
						const cachedPartner = partnerMap.get(partnerId);
						partnerName = cachedPartner?.display_name;
						isDefault = cachedPartner?.x_studio_is_default || false;
						console.log(`Resolving member ${partnerId}: ${partnerName}, isDefault: ${isDefault}`);
					}

					// Only add if we have a valid ID and name
					if (partnerId && partnerName && partnerName !== 'false' && partnerName !== 'undefined' && partnerName !== 'null') {
						memberIds.push({
							id: partnerId,
							display_name: partnerName,
							x_studio_is_default: isDefault
						});
					}
				}
				
				console.log('Extracted members:', memberIds);
				
				if (memberIds.length > 0) {
					// Use cached data
					partners = memberIds;
					console.log('Using cached members:', partners);
				} else if (navigator.onLine) {
					// No valid cached names, fetch from API
					console.log('No cached names, fetching from API...');
					partners = await odooClient.fetchGroupMembers(groupId);
				} else {
					// Offline with no valid cached names
					console.warn('Offline with no cached member names');
					partners = [];
					message = '⚠️ No member data available offline. Please go online first.';
				}
			} else if (navigator.onLine) {
				// No cached members field, fetch from API
				console.log('No x_studio_members field, fetching from API...');
				partners = await odooClient.fetchGroupMembers(groupId);
			} else {
				// Offline and no cached data
				console.warn('Offline with no group member data');
				partners = [];
				message = '⚠️ No group data available offline. Please go online first.';
			}

			// Reset payer and set only default participants as selected
			payer = '';
			participants = partners.filter(p => p.x_studio_is_default === true).map(p => p.id);
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
	
	async function handleRefreshGroups() {
		if (!navigator.onLine) {
			message = '⚠️ Cannot refresh groups while offline';
			return;
		}
		
		loading = true;
		message = 'Refreshing groups and members...';
		
		try {
			// Force refresh groups from server
			await groupCache.sync(true);
			
			// Reload current group members if a group is selected
			if (selectedGroup) {
				await loadGroupMembers(selectedGroup);
			}
			
			message = '✅ Groups and members refreshed!';
			setTimeout(() => { message = ''; }, 3000);
		} catch (err) {
			console.error('Failed to refresh groups:', err);
			message = '❌ Failed to refresh groups';
		} finally {
			loading = false;
		}
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

			// Use offline cache to create expense (works offline!)
			await expenseCache.createExpense(payload);

			if (navigator.onLine) {
				message = '✅ Expense added successfully!';
			} else {
				message = '✅ Expense saved locally! Will sync when online.';
			}

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

	<!-- Offline Indicator -->
	{#if isOffline}
		<div class="offline-banner">
			📡 Offline Mode - Expenses will be synced when you're back online
		</div>
	{/if}

	<nav>
		<a href="/" class="active">Add Expense</a>
		<a href="/balance">Balance Report</a>
	</nav>

	<form on:submit|preventDefault={handleSubmit}>
		<!-- Expense Group Display/Selector -->
		<div class="form-group">
			<div class="group-header">
				<label for="group">Expense Group</label>
				<div class="group-actions">
					{#if selectedGroup && !showGroupSelector}
						<button type="button" class="switch-btn" on:click={toggleGroupSelector} title="Switch group">
							🔄 Switch
						</button>
					{/if}
					{#if !isOffline}
						<button type="button" class="refresh-btn-small" on:click={handleRefreshGroups} title="Refresh groups & members">
							🔄
						</button>
					{/if}
				</div>
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
		padding: 16px;
	}
	
	@media (max-width: 480px) {
		.container {
			padding: 12px;
		}
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

	.offline-banner {
		background: #e3f2fd;
		color: #1565c0;
		padding: 12px 20px;
		border-radius: 10px;
		margin-bottom: 20px;
		text-align: center;
		font-weight: 600;
		border: 2px solid #64b5f6;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.8; }
	}

	form {
		background: white;
		padding: 24px;
		border-radius: 15px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
	}
	
	@media (max-width: 480px) {
		form {
			padding: 16px;
			border-radius: 12px;
		}
	}

	.form-group {
		margin-bottom: 20px;
	}

	.checkbox-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 300px;
		overflow-y: auto;
		padding: 8px 4px;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		background: #fafafa;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 6px;
		background: white;
		border: 1px solid #e5e5e5;
		font-size: 0.95em;
		cursor: pointer;
		transition: all 0.2s;
		word-break: break-word;
		min-height: 44px; /* Better touch target for mobile */
	}
	
	.checkbox-item:hover {
		background: #f0f4ff;
		border-color: #667eea;
	}
	
	.checkbox-item input[type="checkbox"] {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		cursor: pointer;
	}
	
	/* Responsive grid for larger screens */
	@media (min-width: 768px) {
		.checkbox-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
			max-height: 250px;
		}
		
		.checkbox-item {
			min-height: auto;
		}
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
	
	.group-actions {
		display: flex;
		gap: 8px;
		align-items: center;
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
	
	.refresh-btn-small {
		background: #f0f0f0;
		color: #667eea;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		padding: 6px 10px;
		font-size: 1em;
		cursor: pointer;
		transition: all 0.3s;
		width: auto;
		min-width: auto;
	}
	
	.refresh-btn-small:hover:not(:disabled) {
		background: #e8e8e8;
		transform: rotate(360deg);
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
