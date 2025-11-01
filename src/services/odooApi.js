// Odoo API service with offline support
const API_URL = import.meta.env.VITE_API_URL || '/api/odoo'

class OdooAPI {
  constructor() {
    this.apiUrl = API_URL
    this.isOnline = navigator.onLine
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true
      console.log('Network: Online')
    })
    
    window.addEventListener('offline', () => {
      this.isOnline = false
      console.log('Network: Offline')
    })
  }
  
  async callApi(action, data) {
    if (!this.isOnline) {
      throw new Error('No network connection')
    }
    
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, data })
      })
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'API Error')
      }
      
      return result
    } catch (error) {
      console.error('API call failed:', error)
      throw error
    }
  }
  
  // Expense operations
  async createExpense(fields) {
    const result = await this.callApi('create', fields)
    return result.id
  }
  
  async searchExpenses(domain = [], fields = []) {
    const result = await this.callApi('search', { domain, fields })
    return result.results
  }
  
  async updateExpense(id, values) {
    const result = await this.callApi('update', { id, values })
    return result.result
  }
  
  async deleteExpense(id) {
    const result = await this.callApi('delete', { id })
    return result.result
  }
  
  // Generic model operations
  async searchModel(model, domain = [], fields = []) {
    const result = await this.callApi('search_model', { model, domain, fields })
    return result.results
  }
  
  // Partner operations
  async fetchPartners() {
    return await this.searchModel('res.partner', [], ['id', 'display_name', 'x_studio_is_default'])
  }
  
  // Expense group operations
  async fetchExpenseGroups(domain = [], fields = []) {
    const fieldsToFetch = fields.length > 0 ? fields : ['id', 'display_name', 'x_studio_members']
    return await this.searchModel('x_expensegroup', domain, fieldsToFetch)
  }
  
  async fetchGroupMembers(groupId) {
    if (!groupId) return []
    
    const groups = await this.searchModel('x_expensegroup', [['id', '=', groupId]], ['id', 'x_studio_members'])
    
    if (!Array.isArray(groups) || groups.length === 0) return []
    
    const group = groups[0]
    const memberIds = []
    
    if (Array.isArray(group.x_studio_members)) {
      for (const member of group.x_studio_members) {
        if (Array.isArray(member) && member.length > 0) {
          memberIds.push(Number(member[0]))
        } else if (typeof member === 'number') {
          memberIds.push(Number(member))
        }
      }
    }
    
    if (memberIds.length === 0) return []
    
    return await this.searchModel('res.partner', [['id', 'in', memberIds]], ['id', 'display_name', 'x_studio_is_default'])
  }
  
  async createExpenseGroup(fields) {
    const result = await this.callApi('create_group', fields)
    return result.id
  }
  
  async updateExpenseGroup(id, values) {
    const result = await this.callApi('update_group', { id, values })
    return result.result
  }
  
  async deleteExpenseGroup(id) {
    const result = await this.callApi('delete_group', { id })
    return result.result
  }
  
  async markExpensesAsDone(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return false
    }
    
    const updatePromises = ids.map(id => 
      this.updateExpense(id, { x_studio_is_done: true })
    )
    
    try {
      const results = await Promise.all(updatePromises)
      return results.every(result => result === true)
    } catch (error) {
      console.error('Failed to mark expenses as done:', error)
      return false
    }
  }
  
  async markExpensesAsUndone(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return false
    }
    
    const updatePromises = ids.map(id => 
      this.updateExpense(id, { x_studio_is_done: false })
    )
    
    try {
      const results = await Promise.all(updatePromises)
      return results.every(result => result === true)
    } catch (error) {
      console.error('Failed to mark expenses as undone:', error)
      return false
    }
  }
  
  // Field formatting helpers
  formatMany2one(id) {
    return id ? Number(id) : false
  }
  
  formatMany2many(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return []
    return [[6, 0, ids.map((i) => Number(i))]]
  }
}

export const odooApi = new OdooAPI()