import Dexie from 'dexie'

// Create the database instance
export const db = new Dexie('ExpenseSplitDB')

// Define database schema
db.version(1).stores({
  // Master data - cached from Odoo
  partners: 'id, display_name, x_studio_is_default, syncedAt',
  expenseGroups: 'id, display_name, syncedAt',
  
  // Transaction data - offline-first
  expenses: '++localId, id, x_studio_date, x_studio_who_paid, x_studio_value, x_studio_participants, x_studio_is_done, x_studio_description, x_studio_expense_type, x_studio_expense_group, syncStatus, createdAt, updatedAt',
  
  // Sync management
  syncQueue: '++id, type, action, data, timestamp, retries, status',
  
  // App metadata
  settings: 'key, value'
})

// Sync status constants
export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing', 
  SYNCED: 'synced',
  ERROR: 'error'
}

// Action types for sync queue
export const SYNC_ACTION = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete'
}

// Helper to get or create a unique local ID for expenses
export function generateLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Initialize database with default settings if needed
export async function initializeDatabase() {
  try {
    // Check if this is first run
    const isFirstRun = await db.settings.get('initialized')
    if (!isFirstRun) {
      await db.settings.put({ 
        key: 'initialized', 
        value: true,
        timestamp: new Date().toISOString() 
      })
      
      await db.settings.put({ 
        key: 'lastSync', 
        value: null 
      })
      
      await db.settings.put({ 
        key: 'syncInterval', 
        value: 30000 // 30 seconds
      })
      
      console.log('Database initialized successfully')
    }
    return true
  } catch (error) {
    console.error('Failed to initialize database:', error)
    return false
  }
}

// Clear all data (useful for testing/reset)
export async function clearDatabase() {
  await db.partners.clear()
  await db.expenseGroups.clear()
  await db.expenses.clear()
  await db.syncQueue.clear()
  // Don't clear settings
}

// Export database operations
export const dbOps = {
  // Partners operations
  async savePartners(partners) {
    const now = new Date().toISOString()
    const partnersWithSync = partners.map(p => ({
      ...p,
      syncedAt: now
    }))
    await db.partners.bulkPut(partnersWithSync)
    return partnersWithSync
  },
  
  async getPartners() {
    return await db.partners.toArray()
  },
  
  // Expense groups operations
  async saveExpenseGroups(groups) {
    const now = new Date().toISOString()
    const groupsWithSync = groups.map(g => ({
      ...g,
      syncedAt: now
    }))
    await db.expenseGroups.bulkPut(groupsWithSync)
    return groupsWithSync
  },
  
  async getExpenseGroups() {
    return await db.expenseGroups.toArray()
  },
  
  // Expenses operations
  async createExpense(expense) {
    const now = new Date().toISOString()
    const newExpense = {
      ...expense,
      localId: generateLocalId(),
      syncStatus: SYNC_STATUS.PENDING,
      createdAt: now,
      updatedAt: now
    }
    
    const localId = await db.expenses.add(newExpense)
    
    // Add to sync queue
    await db.syncQueue.add({
      type: 'expense',
      action: SYNC_ACTION.CREATE,
      data: newExpense,
      timestamp: now,
      retries: 0,
      status: SYNC_STATUS.PENDING
    })
    
    return { ...newExpense, localId }
  },
  
  async updateExpense(localId, updates) {
    const now = new Date().toISOString()
    const expense = await db.expenses.get(localId)
    
    if (!expense) throw new Error('Expense not found')
    
    const updatedExpense = {
      ...expense,
      ...updates,
      updatedAt: now,
      syncStatus: SYNC_STATUS.PENDING
    }
    
    await db.expenses.put(updatedExpense)
    
    // Add to sync queue
    await db.syncQueue.add({
      type: 'expense',
      action: expense.id ? SYNC_ACTION.UPDATE : SYNC_ACTION.CREATE,
      data: updatedExpense,
      timestamp: now,
      retries: 0,
      status: SYNC_STATUS.PENDING
    })
    
    return updatedExpense
  },
  
  async deleteExpense(localId) {
    const expense = await db.expenses.get(localId)
    if (!expense) throw new Error('Expense not found')
    
    await db.expenses.delete(localId)
    
    // Only add to sync queue if it was synced before
    if (expense.id) {
      await db.syncQueue.add({
        type: 'expense',
        action: SYNC_ACTION.DELETE,
        data: { id: expense.id },
        timestamp: new Date().toISOString(),
        retries: 0,
        status: SYNC_STATUS.PENDING
      })
    }
  },
  
  async getExpenses(filter = {}) {
    let collection = db.expenses.toCollection()
    
    if (filter.x_studio_is_done !== undefined) {
      collection = db.expenses.where('x_studio_is_done').equals(filter.x_studio_is_done)
    }
    
    return await collection.toArray()
  },
  
  // Sync queue operations
  async getPendingSyncItems() {
    return await db.syncQueue
      .where('status')
      .equals(SYNC_STATUS.PENDING)
      .toArray()
  },
  
  async updateSyncItem(id, updates) {
    await db.syncQueue.update(id, updates)
  },
  
  async clearSyncQueue() {
    await db.syncQueue.clear()
  },
  
  // Settings operations
  async getSetting(key) {
    const setting = await db.settings.get(key)
    return setting ? setting.value : null
  },
  
  async setSetting(key, value) {
    await db.settings.put({ key, value })
  }
}