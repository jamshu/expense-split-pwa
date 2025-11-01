<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExpenseStore } from '../stores/useExpenseStore'
import { useMasterDataStore } from '../stores/useMasterDataStore'

const route = useRoute()
const router = useRouter()
const expenseStore = useExpenseStore()
const masterDataStore = useMasterDataStore()

const isEdit = computed(() => !!route.params.id)

const form = ref({
  x_studio_description: '',
  x_studio_date: new Date().toISOString().split('T')[0],
  x_studio_value: '',
  x_studio_who_paid: '',
  x_studio_participants: [],
  x_studio_expense_type: 'grocery',
  x_studio_expense_group: '',
  x_studio_is_done: false
})

const errors = ref({})
const saving = ref(false)

const expenseTypes = [
  { value: 'grocery', label: 'Grocery' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'other', label: 'Other' }
]

const availableParticipants = computed(() => {
  if (!form.value.x_studio_expense_group) {
    return masterDataStore.partners
  }
  return masterDataStore.getGroupMembers(form.value.x_studio_expense_group)
})

onMounted(async () => {
  if (isEdit.value) {
    const expense = expenseStore.expenses.find(
      e => e.localId === route.params.id
    )
    if (expense) {
      form.value = { ...expense }
      // Ensure participants is an array
      if (!Array.isArray(form.value.x_studio_participants)) {
        form.value.x_studio_participants = []
      }
    } else {
      router.push('/expense/new')
    }
  }
})

const validate = () => {
  errors.value = {}
  
  if (!form.value.x_studio_description) {
    errors.value.description = 'Description is required'
  }
  
  if (!form.value.x_studio_value || form.value.x_studio_value <= 0) {
    errors.value.value = 'Amount must be greater than 0'
  }
  
  if (!form.value.x_studio_who_paid) {
    errors.value.payer = 'Please select who paid'
  }
  
  if (!form.value.x_studio_participants.length) {
    errors.value.participants = 'Please select at least one participant'
  }
  
  return Object.keys(errors.value).length === 0
}

const saveExpense = async () => {
  if (!validate()) return
  
  saving.value = true
  try {
    if (isEdit.value) {
      await expenseStore.updateExpense(route.params.id, form.value)
    } else {
      await expenseStore.createExpense(form.value)
    }
    router.push('/')
  } catch (error) {
    console.error('Failed to save expense:', error)
    alert('Failed to save expense. Please try again.')
  } finally {
    saving.value = false
  }
}

const toggleParticipant = (partnerId) => {
  const index = form.value.x_studio_participants.indexOf(partnerId)
  if (index > -1) {
    form.value.x_studio_participants.splice(index, 1)
  } else {
    form.value.x_studio_participants.push(partnerId)
  }
}

const selectAllParticipants = () => {
  form.value.x_studio_participants = availableParticipants.value.map(p => p.id)
}

const clearParticipants = () => {
  form.value.x_studio_participants = []
}
</script>

<template>
  <div class="expense-form">
    <div class="form-header">
      <h2>{{ isEdit ? 'Edit' : 'New' }} Expense</h2>
    </div>

    <form @submit.prevent="saveExpense">
      <div class="form-group">
        <label for="description">Description *</label>
        <input 
          id="description"
          v-model="form.x_studio_description"
          type="text"
          placeholder="What was this expense for?"
        />
        <span v-if="errors.description" class="error">{{ errors.description }}</span>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="date">Date *</label>
          <input 
            id="date"
            v-model="form.x_studio_date"
            type="date"
          />
        </div>

        <div class="form-group">
          <label for="amount">Amount *</label>
          <input 
            id="amount"
            v-model.number="form.x_studio_value"
            type="number"
            step="0.01"
            placeholder="0.00"
          />
          <span v-if="errors.value" class="error">{{ errors.value }}</span>
        </div>
      </div>

      <div class="form-group">
        <label for="type">Type</label>
        <select id="type" v-model="form.x_studio_expense_type">
          <option 
            v-for="type in expenseTypes" 
            :key="type.value" 
            :value="type.value"
          >
            {{ type.label }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label for="group">Expense Group</label>
        <select id="group" v-model="form.x_studio_expense_group">
          <option value="">No group</option>
          <option 
            v-for="group in masterDataStore.expenseGroups" 
            :key="group.id" 
            :value="group.id"
          >
            {{ group.display_name }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label for="payer">Who Paid? *</label>
        <select id="payer" v-model="form.x_studio_who_paid">
          <option value="">Select payer</option>
          <option 
            v-for="partner in availableParticipants" 
            :key="partner.id" 
            :value="partner.id"
          >
            {{ partner.display_name }}
          </option>
        </select>
        <span v-if="errors.payer" class="error">{{ errors.payer }}</span>
      </div>

      <div class="form-group">
        <label>Participants *</label>
        <div class="participant-actions">
          <button type="button" @click="selectAllParticipants" class="btn-small">
            Select All
          </button>
          <button type="button" @click="clearParticipants" class="btn-small">
            Clear
          </button>
        </div>
        <div class="participants-grid">
          <label 
            v-for="partner in availableParticipants" 
            :key="partner.id"
            class="participant-checkbox"
          >
            <input 
              type="checkbox"
              :checked="form.x_studio_participants.includes(partner.id)"
              @change="toggleParticipant(partner.id)"
            />
            <span>{{ partner.display_name }}</span>
          </label>
        </div>
        <span v-if="errors.participants" class="error">{{ errors.participants }}</span>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            v-model="form.x_studio_is_done"
          />
          <span>Mark as settled</span>
        </label>
      </div>

      <div class="form-actions">
        <router-link to="/" class="btn btn-secondary">
          Cancel
        </router-link>
        <button 
          type="submit" 
          class="btn btn-primary"
          :disabled="saving"
        >
          {{ saving ? 'Saving...' : (isEdit ? 'Update' : 'Create') }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.expense-form {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}

.form-header {
  margin-bottom: 2rem;
}

.form-header h2 {
  color: #333;
}

form {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  color: #555;
  font-weight: 500;
}

input[type="text"],
input[type="date"],
input[type="number"],
select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 0.25rem;
  font-size: 1rem;
}

input:focus,
select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.participant-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.btn-small {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  cursor: pointer;
}

.btn-small:hover {
  background: #e5e7eb;
}

.participants-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.5rem;
}

.participant-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #f9fafb;
  border-radius: 0.25rem;
  cursor: pointer;
}

.participant-checkbox:hover {
  background: #f3f4f6;
}

.participant-checkbox input {
  width: auto;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-label input {
  width: auto;
}

.error {
  display: block;
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  text-decoration: none;
  cursor: pointer;
  border: none;
  font-size: 1rem;
  transition: all 0.3s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5a67d8;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f3f4f6;
  color: #333;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>