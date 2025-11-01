import { dbOps, db, SYNC_STATUS, SYNC_ACTION } from '../db'
import { odooApi } from './odooApi'

class SyncService {
  constructor() {
    this.isSyncing = false
    this.syncInterval = null
    this.syncCallbacks = []
  }
  
  // Register callback for sync events
  onSync(callback) {
    this.syncCallbacks.push(callback)
    return () => {
      this.syncCallbacks = this.syncCallbacks.filter(cb => cb !== callback)
    }
  }
  
  // Emit sync events
  emitSyncEvent(event, data) {
    this.syncCallbacks.forEach(callback => callback(event, data))
  }
  
  // Start auto sync
  startAutoSync(intervalMs = 30000) {
    this.stopAutoSync() // Clear any existing interval
    
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.syncAll()
      }
    }, intervalMs)
    
    // Also sync immediately if online
    if (navigator.onLine) {
      this.syncAll()
    }
  }
  
  // Stop auto sync
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }
  
  // Main sync function
  async syncAll() {
    if (this.isSyncing || !navigator.onLine) return
    
    this.isSyncing = true
    this.emitSyncEvent('sync:start', {})
    
    try {
      // Sync master data first
      await this.syncMasterData()
      
      // Then sync pending transactions
      await this.syncPendingTransactions()
      
      // Finally pull latest expenses from server
      await this.pullExpenses()
      
      // Update last sync time
      await dbOps.setSetting('lastSync', new Date().toISOString())
      
      this.emitSyncEvent('sync:success', {})
    } catch (error) {
      console.error('Sync failed:', error)
      this.emitSyncEvent('sync:error', { error })
    } finally {
      this.isSyncing = false
    }
  }
  
  // Sync master data (partners and expense groups)
  async syncMasterData() {
    try {
      // Fetch and save partners
      const partners = await odooApi.fetchPartners()
      await dbOps.savePartners(partners)
      
      // Fetch and save expense groups
      const groups = await odooApi.fetchExpenseGroups()
      await dbOps.saveExpenseGroups(groups)
      
      console.log('Master data synced successfully')
    } catch (error) {
      console.error('Failed to sync master data:', error)
      throw error
    }
  }
  
  // Sync pending transactions from queue
  async syncPendingTransactions() {
    const pendingItems = await dbOps.getPendingSyncItems()
    
    for (const item of pendingItems) {
      try {
        await dbOps.updateSyncItem(item.id, { status: SYNC_STATUS.SYNCING })
        
        if (item.type === 'expense') {
          await this.syncExpenseItem(item)
        }
        
        // Mark as synced and remove from queue
        await db.syncQueue.delete(item.id)
      } catch (error) {
        console.error('Failed to sync item:', item, error)
        
        // Increment retry count
        await dbOps.updateSyncItem(item.id, {
          status: SYNC_STATUS.ERROR,
          retries: (item.retries || 0) + 1,
          lastError: error.message
        })
        
        // If too many retries, mark as failed
        if (item.retries >= 3) {
          await dbOps.updateSyncItem(item.id, { status: 'failed' })
        }
      }
    }
  }
  
  // Sync individual expense item
  async syncExpenseItem(item) {
    const { action, data } = item
    
    switch (action) {
      case SYNC_ACTION.CREATE:
        // Create expense in Odoo
        const newId = await odooApi.createExpense({
          x_studio_description: data.x_studio_description,
          x_studio_date: data.x_studio_date,
          x_studio_value: data.x_studio_value,
          x_studio_who_paid: odooApi.formatMany2one(data.x_studio_who_paid),
          x_studio_participants: odooApi.formatMany2many(data.x_studio_participants),
          x_studio_expense_type: data.x_studio_expense_type,
          x_studio_expense_group: odooApi.formatMany2one(data.x_studio_expense_group),
          x_studio_is_done: data.x_studio_is_done || false
        })
        
        // Update local expense with Odoo ID
        await db.expenses
          .where('localId')
          .equals(data.localId)
          .modify({ 
            id: newId, 
            syncStatus: SYNC_STATUS.SYNCED 
          })
        break
        
      case SYNC_ACTION.UPDATE:
        await odooApi.updateExpense(data.id, {
          x_studio_description: data.x_studio_description,
          x_studio_date: data.x_studio_date,
          x_studio_value: data.x_studio_value,
          x_studio_who_paid: odooApi.formatMany2one(data.x_studio_who_paid),
          x_studio_participants: odooApi.formatMany2many(data.x_studio_participants),
          x_studio_expense_type: data.x_studio_expense_type,
          x_studio_expense_group: odooApi.formatMany2one(data.x_studio_expense_group),
          x_studio_is_done: data.x_studio_is_done || false
        })
        
        // Update sync status
        await db.expenses
          .where('localId')
          .equals(data.localId)
          .modify({ syncStatus: SYNC_STATUS.SYNCED })
        break
        
      case SYNC_ACTION.DELETE:
        await odooApi.deleteExpense(data.id)
        break
    }
  }
  
  // Pull latest expenses from server
  async pullExpenses() {
    try {
      // Fetch all expenses from server
      const serverExpenses = await odooApi.searchExpenses([], [
        'id',
        'x_studio_description',
        'x_studio_date',
        'x_studio_value',
        'x_studio_who_paid',
        'x_studio_participants',
        'x_studio_expense_type',
        'x_studio_expense_group',
        'x_studio_is_done'
      ])
      
      // Get local expenses with server IDs
      const localExpenses = await db.expenses
        .where('id')
        .notEqual(null)
        .toArray()
      
      // Create a map of server expenses
      const serverExpenseMap = new Map()
      serverExpenses.forEach(exp => {
        serverExpenseMap.set(exp.id, exp)
      })
      
      // Update or add expenses from server
      for (const serverExp of serverExpenses) {
        const localExp = localExpenses.find(e => e.id === serverExp.id)
        
        if (localExp) {
          // Update existing expense if server version is newer
          // (This is a simplified conflict resolution - you might want more sophisticated logic)
          await db.expenses
            .where('id')
            .equals(serverExp.id)
            .modify({
              ...serverExp,
              syncStatus: SYNC_STATUS.SYNCED,
              updatedAt: new Date().toISOString()
            })
        } else {
          // Add new expense from server
          await db.expenses.add({
            ...serverExp,
            localId: `server_${serverExp.id}_${Date.now()}`,
            syncStatus: SYNC_STATUS.SYNCED,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        }
      }
      
      // Remove local expenses that don't exist on server
      for (const localExp of localExpenses) {
        if (!serverExpenseMap.has(localExp.id)) {
          await db.expenses.delete(localExp.localId)
        }
      }
      
      console.log('Expenses pulled from server successfully')
    } catch (error) {
      console.error('Failed to pull expenses:', error)
      throw error
    }
  }
  
  // Manual sync trigger
  async syncNow() {
    return this.syncAll()
  }
  
  // Check if syncing
  get syncing() {
    return this.isSyncing
  }
}

export const syncService = new SyncService()