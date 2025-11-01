import express from 'express'
import { createServer as createViteServer } from 'vite'

const app = express()
app.use(express.json())

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
    switch (action) {
      case 'search_model':
        if (data.model === 'res.partner') {
          res.json({ success: true, results: mockPartners })
        } else if (data.model === 'x_expensegroup') {
          res.json({ success: true, results: mockGroups })
        } else {
          res.json({ success: true, results: [] })
        }
        break
        
      case 'search':
        res.json({ success: true, results: mockExpenses })
        break
        
      case 'create':
        const newExpense = { ...data, id: nextExpenseId++ }
        mockExpenses.push(newExpense)
        res.json({ success: true, id: newExpense.id })
        break
        
      case 'update':
        const index = mockExpenses.findIndex(e => e.id === data.id)
        if (index !== -1) {
          mockExpenses[index] = { ...mockExpenses[index], ...data.values }
          res.json({ success: true, result: true })
        } else {
          res.json({ success: false, error: 'Expense not found' })
        }
        break
        
      case 'delete':
        mockExpenses = mockExpenses.filter(e => e.id !== data.id)
        res.json({ success: true, result: true })
        break
        
      default:
        res.json({ success: true, results: [] })
    }
  } catch (error) {
    console.error('API error:', error)
    res.json({ success: false, error: error.message })
  }
})

// Create Vite server in middleware mode
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'spa'
})

// Use vite's connect instance as middleware
app.use(vite.middlewares)

const PORT = process.env.PORT || 5173
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})