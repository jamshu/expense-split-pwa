<script setup>
import { computed } from 'vue'
import { useExpenseStore } from '../stores/useExpenseStore'
import { useMasterDataStore } from '../stores/useMasterDataStore'
import { calculateBalances, calculateSettlements } from '../utils/expenseCalculations'

const expenseStore = useExpenseStore()
const masterDataStore = useMasterDataStore()

const balances = computed(() => 
  calculateBalances(
    expenseStore.unsettledExpenses,
    masterDataStore.partners
  )
)

const settlements = computed(() => 
  calculateSettlements(balances.value)
)

const totalUnsettled = computed(() => {
  return Object.values(balances.value)
    .filter(b => b > 0)
    .reduce((sum, b) => sum + b, 0)
    .toFixed(2)
})
</script>

<template>
  <div class="balance-view">
    <div class="view-header">
      <h2>Balance Sheet</h2>
      <p class="subtitle">Who owes whom</p>
    </div>

    <div class="summary-card">
      <h3>Summary</h3>
      <div class="summary-stats">
        <div class="stat">
          <span class="stat-label">Unsettled Expenses</span>
          <span class="stat-value">{{ expenseStore.unsettledExpenses.length }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total Amount</span>
          <span class="stat-value">${{ totalUnsettled }}</span>
        </div>
      </div>
    </div>

    <div class="balances-section">
      <h3>Individual Balances</h3>
      <div v-if="Object.keys(balances).length === 0" class="empty">
        No unsettled expenses
      </div>
      <div v-else class="balance-cards">
        <div 
          v-for="(balance, person) in balances" 
          :key="person"
          class="balance-card"
          :class="{ positive: balance > 0, negative: balance < 0 }"
        >
          <span class="person">{{ person }}</span>
          <span class="amount">
            <span v-if="balance > 0">+</span>
            ${{ Math.abs(balance).toFixed(2) }}
          </span>
          <span class="status">
            {{ balance > 0 ? 'is owed' : balance < 0 ? 'owes' : 'settled' }}
          </span>
        </div>
      </div>
    </div>

    <div class="settlements-section">
      <h3>Suggested Settlements</h3>
      <div v-if="settlements.length === 0" class="empty">
        All expenses are settled!
      </div>
      <div v-else class="settlement-cards">
        <div 
          v-for="(settlement, index) in settlements" 
          :key="index"
          class="settlement-card"
        >
          <div class="settlement-flow">
            <span class="from">{{ settlement.from }}</span>
            <span class="arrow">→</span>
            <span class="to">{{ settlement.to }}</span>
          </div>
          <div class="settlement-amount">
            ${{ settlement.amount.toFixed(2) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.balance-view {
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

.summary-card {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 2rem;
}

.summary-card h3 {
  margin-bottom: 1rem;
  color: #333;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.stat {
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
}

.stat-label {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #667eea;
}

.balances-section,
.settlements-section {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 2rem;
}

.balances-section h3,
.settlements-section h3 {
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

.balance-cards {
  display: grid;
  gap: 1rem;
}

.balance-card {
  display: flex;
  align-items: center;
  padding: 1rem;
  border-radius: 0.5rem;
  background: #f9fafb;
}

.balance-card.positive {
  background: #d1fae5;
}

.balance-card.negative {
  background: #fee2e2;
}

.balance-card .person {
  flex: 1;
  font-weight: 500;
  color: #333;
}

.balance-card .amount {
  font-size: 1.125rem;
  font-weight: bold;
  margin: 0 1rem;
}

.balance-card.positive .amount {
  color: #065f46;
}

.balance-card.negative .amount {
  color: #991b1b;
}

.balance-card .status {
  font-size: 0.875rem;
  color: #666;
}

.settlement-cards {
  display: grid;
  gap: 1rem;
}

.settlement-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f0f9ff;
  border-left: 4px solid #667eea;
  border-radius: 0.5rem;
}

.settlement-flow {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
}

.settlement-flow .from {
  font-weight: 500;
  color: #991b1b;
}

.settlement-flow .arrow {
  color: #666;
  font-size: 1.25rem;
}

.settlement-flow .to {
  font-weight: 500;
  color: #065f46;
}

.settlement-amount {
  font-size: 1.25rem;
  font-weight: bold;
  color: #667eea;
}
</style>