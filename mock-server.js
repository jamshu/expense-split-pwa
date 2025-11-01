// Simple mock server for development
import express from 'express'
import cors from 'cors'

const app = express()
app.use(express.json())
app.use(cors())

// Mock data
const mockPartners = [
  { id: 1, display_name: 'Alice', x_studio_is_default: true },
  { id: 2, display_name: 'Bob', x_studio_is_default: false },
  { id: 3, display_name: 'Charlie', x_studio_is_default: false },
  { id: 4, display_name: 'David', x_studio_is_default: false }
]

const mockGroups = [
  { id: 1, display_name: 'Roommates', x_studio_members: [1, 2, 3] },
  { id: 2, display_name: 'Weekend Trip', x_studio_members: [1, 2, 3, 4] }
]

let mockExpenses = []
let nextExpenseId = 1

// API endpoint
app.post('/api/odoo', (req, res) => {
  const { action, data } = req.body
  
  console.log('API call:', action, data)
  
  try {
    let response = { success: true }
    
    switch (action) {
      case 'search_model':
        if (data?.model === 'res.partner') {
          response.results = mockPartners
        } else if (data?.model === 'x_expensegroup') {
          response.results = mockGroups
        } else {
          response.results = []
        }
        break
        
      case 'search':
        response.results = mockExpenses
        break
        
      case 'create':
        const newExpense = { ...data, id: nextExpenseId++ }
        mockExpenses.push(newExpense)
        response.id = newExpense.id
        break
        
      case 'update':
        const index = mockExpenses.findIndex(e => e.id === data.id)
        if (index !== -1) {
          mockExpenses[index] = { ...mockExpenses[index], ...data.values }
          response.result = true
        } else {
          response.success = false
          response.error = 'Expense not found'
        }
        break
        
      case 'delete':
        mockExpenses = mockExpenses.filter(e => e.id !== data.id)
        response.result = true
        break
        
      default:
        response.results = []
    }
    
    res.json(response)
  } catch (error) {
    console.error('API error:', error)
    res.json({ success: false, error: error.message })
  }
})

const PORT = 3000
app.listen(PORT, () => {
  console.log(`Mock API server running at http://localhost:${PORT}`)
})