import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dbOps } from '../db'
import { syncService } from '../services/syncService'

export const useExpenseStore = defineStore('expenses', () => {
  // State
  const expenses = ref([])
  const loading = ref(false)
  const error = ref(null)
  const syncStatus = ref('idle')
  
  // Computed
  const unsettledExpenses = computed(() => 
    expenses.value.filter(e => !e.x_studio_is_done)
  )
  
  const settledExpenses = computed(() => 
    expenses.value.filter(e => e.x_studio_is_done)
  )
  
  const totalExpenses = computed(() => expenses.value.length)
  
  // Actions
  async function loadExpenses() {
    loading.value = true
    error.value = null
    try {
      expenses.value = await dbOps.getExpenses()
    } catch (err) {
      error.value = err.message
      console.error('Failed to load expenses:', err)
    } finally {
      loading.value = false
    }
  }
  
  async function createExpense(expenseData) {
    loading.value = true
    error.value = null
    try {
      const newExpense = await dbOps.createExpense(expenseData)
      expenses.value.push(newExpense)
      return newExpense
    } catch (err) {
      error.value = err.message
      console.error('Failed to create expense:', err)
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function updateExpense(localId, updates) {
    loading.value = true
    error.value = null
    try {
      const updatedExpense = await dbOps.updateExpense(localId, updates)
      const index = expenses.value.findIndex(e => e.localId === localId)
      if (index !== -1) {
        expenses.value[index] = updatedExpense
      }
      return updatedExpense
    } catch (err) {
      error.value = err.message
      console.error('Failed to update expense:', err)
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function deleteExpense(localId) {
    loading.value = true
    error.value = null
    try {
      await dbOps.deleteExpense(localId)
      expenses.value = expenses.value.filter(e => e.localId !== localId)
    } catch (err) {
      error.value = err.message
      console.error('Failed to delete expense:', err)
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function markExpensesAsDone(localIds) {
    loading.value = true
    error.value = null
    try {
      for (const localId of localIds) {
        await updateExpense(localId, { x_studio_is_done: true })
      }
    } catch (err) {
      error.value = err.message
      console.error('Failed to mark expenses as done:', err)
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function syncExpenses() {
    syncStatus.value = 'syncing'
    try {
      await syncService.syncNow()
      await loadExpenses() // Reload after sync
      syncStatus.value = 'success'
    } catch (err) {
      syncStatus.value = 'error'
      error.value = err.message
      console.error('Sync failed:', err)
    }
  }
  
  // Initialize sync listener
  syncService.onSync((event, data) => {
    if (event === 'sync:start') {
      syncStatus.value = 'syncing'
    } else if (event === 'sync:success') {
      syncStatus.value = 'success'
      loadExpenses() // Reload data after successful sync
    } else if (event === 'sync:error') {
      syncStatus.value = 'error'
      error.value = data.error?.message || 'Sync failed'
    }
  })
  
  return {
    // State
    expenses,
    loading,
    error,
    syncStatus,
    
    // Computed
    unsettledExpenses,
    settledExpenses,
    totalExpenses,
    
    // Actions
    loadExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    markExpensesAsDone,
    syncExpenses
  }
})