<script setup>
import { ref } from 'vue'
import { useExpenseStore } from '../stores/useExpenseStore'
import { useMasterDataStore } from '../stores/useMasterDataStore'
import { syncService } from '../services/syncService'
import { clearDatabase } from '../db'

const expenseStore = useExpenseStore()
const masterDataStore = useMasterDataStore()

const syncing = ref(false)
const clearing = ref(false)

const manualSync = async () => {
  syncing.value = true
  try {
    await syncService.syncNow()
    await masterDataStore.loadMasterData()
    await expenseStore.loadExpenses()
    alert('Sync completed successfully!')
  } catch (error) {
    console.error('Sync failed:', error)
    alert('Sync failed. Please check your connection and try again.')
  } finally {
    syncing.value = false
  }
}

const clearAllData = async () => {
  if (!confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
    return
  }
  
  clearing.value = true
  try {
    await clearDatabase()
    await masterDataStore.loadMasterData()
    await expenseStore.loadExpenses()
    alert('All local data has been cleared.')
  } catch (error) {
    console.error('Failed to clear data:', error)
    alert('Failed to clear data. Please try again.')
  } finally {
    clearing.value = false
  }
}

const refreshMasterData = async () => {
  try {
    await masterDataStore.fetchMasterData()
    alert('Master data refreshed successfully!')
  } catch (error) {
    console.error('Failed to refresh master data:', error)
    alert('Failed to refresh master data. Please check your connection.')
  }
}
</script>

<template>
  <div class="settings-view">
    <div class="view-header">
      <h2>Settings</h2>
      <p class="subtitle">Manage app data and synchronization</p>
    </div>

    <div class="settings-section">
      <h3>Synchronization</h3>
      
      <div class="setting-item">
        <div class="setting-info">
          <h4>Last Sync</h4>
          <p>
            {{ masterDataStore.lastSyncTime 
              ? new Date(masterDataStore.lastSyncTime).toLocaleString() 
              : 'Never' 
            }}
          </p>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h4>Sync Status</h4>
          <p>
            <span class="status-badge" :class="expenseStore.syncStatus">
              {{ expenseStore.syncStatus }}
            </span>
          </p>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h4>Manual Sync</h4>
          <p>Force sync all data with the server</p>
        </div>
        <button 
          @click="manualSync" 
          :disabled="syncing"
          class="btn btn-primary"
        >
          {{ syncing ? 'Syncing...' : 'Sync Now' }}
        </button>
      </div>
    </div>

    <div class="settings-section">
      <h3>Master Data</h3>
      
      <div class="setting-item">
        <div class="setting-info">
          <h4>Partners</h4>
          <p>{{ masterDataStore.partners.length }} partners cached</p>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h4>Expense Groups</h4>
          <p>{{ masterDataStore.expenseGroups.length }} groups cached</p>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h4>Refresh Master Data</h4>
          <p>Fetch latest partners and groups from server</p>
        </div>
        <button 
          @click="refreshMasterData" 
          :disabled="masterDataStore.loading"
          class="btn btn-secondary"
        >
          {{ masterDataStore.loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div class="settings-section">
      <h3>Local Data</h3>
      
      <div class="setting-item">
        <div class="setting-info">
          <h4>Expenses</h4>
          <p>
            {{ expenseStore.totalExpenses }} total expenses
            ({{ expenseStore.unsettledExpenses.length }} unsettled)
          </p>
        </div>
      </div>

      <div class="setting-item danger">
        <div class="setting-info">
          <h4>Clear All Data</h4>
          <p>Remove all local data. This cannot be undone.</p>
        </div>
        <button 
          @click="clearAllData" 
          :disabled="clearing"
          class="btn btn-danger"
        >
          {{ clearing ? 'Clearing...' : 'Clear Data' }}
        </button>
      </div>
    </div>

    <div class="settings-section">
      <h3>About</h3>
      <div class="about-info">
        <p>Expense Split PWA</p>
        <p>Version: 1.0.0</p>
        <p>Built with Vue 3 + Vite + Dexie</p>
        <p>Offline-first architecture</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.view-header {
  margin-bottom: 2rem;
}

.view-header h2 {
  color: #333;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
  font-size: 0.875rem;
}

.settings-section {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 1.5rem;
}

.settings-section h3 {
  margin-bottom: 1rem;
  color: #333;
  font-size: 1.125rem;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid #e5e7eb;
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
}

.setting-info h4 {
  font-size: 1rem;
  color: #333;
  margin-bottom: 0.25rem;
}

.setting-info p {
  font-size: 0.875rem;
  color: #666;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 500;
}

.status-badge.idle {
  background: #f3f4f6;
  color: #666;
}

.status-badge.syncing {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.success {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.error {
  background: #fee2e2;
  color: #991b1b;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.3s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5a67d8;
}

.btn-secondary {
  background: #f3f4f6;
  color: #333;
}

.btn-secondary:hover:not(:disabled) {
  background: #e5e7eb;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.setting-item.danger .setting-info h4 {
  color: #dc2626;
}

.about-info {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
}

.about-info p {
  margin: 0.5rem 0;
  color: #666;
  font-size: 0.875rem;
}

@media (max-width: 640px) {
  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
}
</style>