<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useExpenseStore } from '../stores/useExpenseStore'
import { useMasterDataStore } from '../stores/useMasterDataStore'

const router = useRouter()
const expenseStore = useExpenseStore()
const masterDataStore = useMasterDataStore()

const filter = ref('all') // all, unsettled, settled

const filteredExpenses = computed(() => {
  if (filter.value === 'unsettled') {
    return expenseStore.unsettledExpenses
  } else if (filter.value === 'settled') {
    return expenseStore.settledExpenses
  }
  return expenseStore.expenses
})

const formatDate = (date) => {
  if (!date) return 'No date'
  return new Date(date).toLocaleDateString()
}

const getPartnerName = (partnerId) => {
  const partner = masterDataStore.getPartnerById(partnerId)
  return partner ? partner.display_name : `Partner ${partnerId}`
}

const deleteExpense = async (expense) => {
  if (confirm('Are you sure you want to delete this expense?')) {
    await expenseStore.deleteExpense(expense.localId)
  }
}

const editExpense = (expense) => {
  router.push(`/expense/edit/${expense.localId}`)
}
</script>

<template>
  <div class="expense-list">
    <div class="list-header">
      <h2>Expenses</h2>
      <div class="filter-buttons">
        <button 
          @click="filter = 'all'" 
          :class="{ active: filter === 'all' }"
        >
          All ({{ expenseStore.totalExpenses }})
        </button>
        <button 
          @click="filter = 'unsettled'" 
          :class="{ active: filter === 'unsettled' }"
        >
          Unsettled ({{ expenseStore.unsettledExpenses.length }})
        </button>
        <button 
          @click="filter = 'settled'" 
          :class="{ active: filter === 'settled' }"
        >
          Settled ({{ expenseStore.settledExpenses.length }})
        </button>
      </div>
    </div>

    <div v-if="expenseStore.loading" class="loading">
      Loading expenses...
    </div>

    <div v-else-if="filteredExpenses.length === 0" class="empty">
      <p>No expenses found</p>
      <router-link to="/expense/new" class="btn btn-primary">
        Add First Expense
      </router-link>
    </div>

    <div v-else class="expense-cards">
      <div 
        v-for="expense in filteredExpenses" 
        :key="expense.localId"
        class="expense-card"
        :class="{ settled: expense.x_studio_is_done }"
      >
        <div class="expense-header">
          <h3>{{ expense.x_studio_description || 'No description' }}</h3>
          <span class="amount">${{ expense.x_studio_value || 0 }}</span>
        </div>
        
        <div class="expense-details">
          <div class="detail-row">
            <span class="label">Date:</span>
            <span>{{ formatDate(expense.x_studio_date) }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Paid by:</span>
            <span>{{ getPartnerName(expense.x_studio_who_paid) }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Type:</span>
            <span>{{ expense.x_studio_expense_type || 'General' }}</span>
          </div>
        </div>

        <div class="expense-footer">
          <div class="sync-status">
            <span 
              class="sync-badge" 
              :class="expense.syncStatus"
            >
              {{ expense.syncStatus || 'pending' }}
            </span>
          </div>
          <div class="actions">
            <button @click="editExpense(expense)" class="btn-icon">
              ✏️
            </button>
            <button @click="deleteExpense(expense)" class="btn-icon delete">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <router-link to="/expense/new" class="fab">
      +
    </router-link>
  </div>
</template>

<style scoped>
.expense-list {
  padding: 1rem;
}

.list-header {
  margin-bottom: 1.5rem;
}

.list-header h2 {
  margin-bottom: 1rem;
  color: #333;
}

.filter-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-buttons button {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.3s;
}

.filter-buttons button.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.loading, .empty {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.expense-cards {
  display: grid;
  gap: 1rem;
  margin-bottom: 4rem;
}

.expense-card {
  background: white;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: all 0.3s;
}

.expense-card.settled {
  opacity: 0.7;
  background: #f9fafb;
}

.expense-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 1rem;
}

.expense-header h3 {
  flex: 1;
  font-size: 1.125rem;
  color: #333;
  margin: 0;
}

.amount {
  font-size: 1.25rem;
  font-weight: bold;
  color: #667eea;
}

.expense-details {
  margin-bottom: 1rem;
}

.detail-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

.detail-row .label {
  color: #666;
  min-width: 80px;
}

.expense-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  border-top: 1px solid #e5e7eb;
}

.sync-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
  font-weight: 500;
}

.sync-badge.synced {
  background: #d1fae5;
  color: #065f46;
}

.sync-badge.pending {
  background: #fef3c7;
  color: #92400e;
}

.sync-badge.error {
  background: #fee2e2;
  color: #991b1b;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  padding: 0.25rem;
  transition: transform 0.2s;
}

.btn-icon:hover {
  transform: scale(1.1);
}

.btn-icon.delete:hover {
  filter: hue-rotate(180deg);
}

.fab {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #667eea;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  text-decoration: none;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transition: all 0.3s;
}

.fab:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
}

.btn-primary {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background: #667eea;
  color: white;
  text-decoration: none;
  border-radius: 0.5rem;
  margin-top: 1rem;
}
</style>