<script setup>
import { computed } from 'vue'
import { useExpenseStore } from '../stores/useExpenseStore'
import { useMasterDataStore } from '../stores/useMasterDataStore'
import { 
  calculateTotalsByPerson, 
  groupExpensesByDate,
  groupExpensesByType 
} from '../utils/expenseCalculations'

const expenseStore = useExpenseStore()
const masterDataStore = useMasterDataStore()

const totalsByPerson = computed(() => 
  calculateTotalsByPerson(
    expenseStore.expenses,
    masterDataStore.partners
  )
)

const expensesByType = computed(() => {
  const grouped = groupExpensesByType(expenseStore.expenses)
  return Object.entries(grouped).map(([type, expenses]) => ({
    type,
    count: expenses.length,
    total: expenses.reduce((sum, e) => sum + (e.x_studio_value || 0), 0)
  }))
})

const monthlyExpenses = computed(() => {
  const grouped = groupExpensesByDate(expenseStore.expenses)
  const monthly = {}
  
  Object.entries(grouped).forEach(([date, expenses]) => {
    const month = date.substring(0, 7) // YYYY-MM
    if (!monthly[month]) {
      monthly[month] = { count: 0, total: 0 }
    }
    monthly[month].count += expenses.length
    monthly[month].total += expenses.reduce((sum, e) => sum + (e.x_studio_value || 0), 0)
  })
  
  return Object.entries(monthly)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, data]) => ({ month, ...data }))
})

const totalExpenseAmount = computed(() => 
  expenseStore.expenses.reduce((sum, e) => sum + (e.x_studio_value || 0), 0)
)
</script>

<template>
  <div class="reports-view">
    <div class="view-header">
      <h2>Reports</h2>
      <p class="subtitle">Expense analytics and insights</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Expenses</h3>
        <div class="stat-value">${{ totalExpenseAmount.toFixed(2) }}</div>
        <div class="stat-label">{{ expenseStore.totalExpenses }} transactions</div>
      </div>

      <div class="stat-card">
        <h3>Unsettled</h3>
        <div class="stat-value">{{ expenseStore.unsettledExpenses.length }}</div>
        <div class="stat-label">expenses pending</div>
      </div>

      <div class="stat-card">
        <h3>Participants</h3>
        <div class="stat-value">{{ Object.keys(totalsByPerson).length }}</div>
        <div class="stat-label">people involved</div>
      </div>
    </div>

    <div class="report-section">
      <h3>By Person</h3>
      <div v-if="Object.keys(totalsByPerson).length === 0" class="empty">
        No expense data
      </div>
      <div v-else class="person-stats">
        <div 
          v-for="(stats, person) in totalsByPerson" 
          :key="person"
          class="person-card"
        >
          <div class="person-name">{{ person }}</div>
          <div class="person-details">
            <div class="detail">
              <span class="label">Paid:</span>
              <span class="value">${{ stats.paid.toFixed(2) }}</span>
            </div>
            <div class="detail">
              <span class="label">Owes:</span>
              <span class="value">${{ stats.owed.toFixed(2) }}</span>
            </div>
            <div class="detail" :class="{ positive: stats.net > 0, negative: stats.net < 0 }">
              <span class="label">Net:</span>
              <span class="value">
                {{ stats.net > 0 ? '+' : '' }}${{ Math.abs(stats.net).toFixed(2) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="report-section">
      <h3>By Type</h3>
      <div v-if="expensesByType.length === 0" class="empty">
        No expense data
      </div>
      <div v-else class="type-stats">
        <div 
          v-for="item in expensesByType" 
          :key="item.type"
          class="type-card"
        >
          <div class="type-header">
            <span class="type-name">{{ item.type }}</span>
            <span class="type-count">{{ item.count }} expenses</span>
          </div>
          <div class="type-total">${{ item.total.toFixed(2) }}</div>
          <div class="type-bar">
            <div 
              class="type-bar-fill" 
              :style="{ width: (item.total / totalExpenseAmount * 100) + '%' }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div class="report-section">
      <h3>Monthly Trends</h3>
      <div v-if="monthlyExpenses.length === 0" class="empty">
        No expense data
      </div>
      <div v-else class="monthly-stats">
        <div 
          v-for="item in monthlyExpenses" 
          :key="item.month"
          class="month-card"
        >
          <div class="month-name">{{ item.month }}</div>
          <div class="month-details">
            <span class="count">{{ item.count }} expenses</span>
            <span class="total">${{ item.total.toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports-view {
  padding: 1rem;
  max-width: 1000px;
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.stat-card h3 {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: #667eea;
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.875rem;
  color: #999;
}

.report-section {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 1.5rem;
}

.report-section h3 {
  margin-bottom: 1rem;
  color: #333;
}

.empty {
  text-align: center;
  padding: 2rem;
  color: #666;
  background: #f9fafb;
  border-radius: 0.5rem;
}

.person-stats {
  display: grid;
  gap: 1rem;
}

.person-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
}

.person-name {
  font-weight: 500;
  color: #333;
  min-width: 120px;
}

.person-details {
  display: flex;
  gap: 2rem;
}

.detail {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.detail .label {
  font-size: 0.75rem;
  color: #666;
  margin-bottom: 0.25rem;
}

.detail .value {
  font-weight: 600;
  color: #333;
}

.detail.positive .value {
  color: #065f46;
}

.detail.negative .value {
  color: #991b1b;
}

.type-stats {
  display: grid;
  gap: 1rem;
}

.type-card {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
}

.type-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.type-name {
  font-weight: 500;
  color: #333;
  text-transform: capitalize;
}

.type-count {
  font-size: 0.875rem;
  color: #666;
}

.type-total {
  font-size: 1.25rem;
  font-weight: bold;
  color: #667eea;
  margin-bottom: 0.5rem;
}

.type-bar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.type-bar-fill {
  height: 100%;
  background: #667eea;
  transition: width 0.3s;
}

.monthly-stats {
  display: grid;
  gap: 0.5rem;
}

.month-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
}

.month-name {
  font-weight: 500;
  color: #333;
}

.month-details {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.month-details .count {
  font-size: 0.875rem;
  color: #666;
}

.month-details .total {
  font-weight: 600;
  color: #667eea;
}

@media (max-width: 640px) {
  .person-details {
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-end;
  }
  
  .detail {
    flex-direction: row;
    gap: 0.5rem;
  }
}
</style>