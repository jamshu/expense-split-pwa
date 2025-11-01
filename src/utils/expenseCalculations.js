// Utility functions for expense calculations

/**
 * Normalize a person field which may be a string, number, or [id, name] tuple or object.
 * Returns a display string to be used as the key in balances map.
 */
function normalizePerson(person) {
  if (person == null) return ''
  // If person is an array/tuple like [id, name]
  if (Array.isArray(person) && person.length >= 2) return String(person[1])
  // If person is an object with display_name
  if (typeof person === 'object') {
    if (person.display_name) return String(person.display_name)
    if (person.name) return String(person.name)
  }
  // Primitive fallback
  return String(person)
}

/**
 * Normalize participants field into an array of display strings.
 * Accepts:
 * - comma separated string 'Alice, Bob'
 * - array of ids [1,2,3]
 * - array of tuples [[1,'Alice'], [2,'Bob']]
 * - array of objects [{id:1, display_name:'Alice'}]
 */
function normalizeParticipants(raw) {
  if (!raw) return []
  // comma-separated string
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }

  if (Array.isArray(raw)) {
    // array of tuples or objects or ids
    const results = []
    for (const item of raw) {
      if (Array.isArray(item) && item.length >= 2) {
        results.push(String(item[1]))
      } else if (item && typeof item === 'object') {
        if (item.display_name) results.push(String(item.display_name))
        else if (item.name) results.push(String(item.name))
        else if (item.id) results.push(String(item.id))
      } else if (item != null) {
        // primitive id or string
        results.push(String(item))
      }
    }
    return results.filter(Boolean)
  }

  // fallback
  return [String(raw)]
}

/**
 * Calculate balances from expenses
 * @param {Array} expenses - Array of expense objects
 * @param {Array} partners - Array of partner objects for name resolution
 * @returns {Object} Balance map with person names as keys
 */
export function calculateBalances(expenses, partners = []) {
  const balances = {}
  
  // Create a map for quick partner lookup
  const partnerMap = new Map()
  partners.forEach(p => {
    partnerMap.set(p.id, p.display_name)
  })
  
  // Helper to get partner name
  const getPartnerName = (id) => {
    if (!id) return ''
    if (typeof id === 'number' || typeof id === 'string') {
      return partnerMap.get(Number(id)) || `Partner ${id}`
    }
    if (Array.isArray(id) && id.length >= 2) {
      return String(id[1])
    }
    if (typeof id === 'object' && id.display_name) {
      return id.display_name
    }
    return String(id)
  }
  
  // Process expenses
  for (const expense of expenses) {
    const amount = parseFloat(String(expense.x_studio_value || 0))
    if (amount <= 0) continue
    
    // Get payer name
    const payer = getPartnerName(expense.x_studio_who_paid)
    if (!payer) continue
    
    // Get participant names
    const participantIds = expense.x_studio_participants || []
    const participants = []
    
    if (Array.isArray(participantIds)) {
      for (const pId of participantIds) {
        const name = getPartnerName(pId)
        if (name) participants.push(name)
      }
    }
    
    if (participants.length === 0) continue
    
    // Initialize balances
    if (!balances[payer]) balances[payer] = 0
    participants.forEach((p) => {
      if (!balances[p]) balances[p] = 0
    })
    
    // Payer gets credited
    balances[payer] += amount
    
    // Split amount among participants
    const sharePerPerson = amount / participants.length
    participants.forEach((p) => {
      balances[p] -= sharePerPerson
    })
  }
  
  // Round to 2 decimal places
  Object.keys(balances).forEach(key => {
    balances[key] = Math.round(balances[key] * 100) / 100
  })
  
  return balances
}

/**
 * Calculate settlements (who owes whom)
 * @param {Object} balances - Balance map from calculateBalances
 * @returns {Array} Array of settlement objects {from, to, amount}
 */
export function calculateSettlements(balances) {
  const creditors = []
  const debtors = []
  
  for (const [person, balance] of Object.entries(balances)) {
    if (balance > 0.01) {
      creditors.push({ person, amount: balance })
    } else if (balance < -0.01) {
      debtors.push({ person, amount: -balance })
    }
  }
  
  const settlements = []
  
  let i = 0
  let j = 0
  
  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i]
    const debtor = debtors[j]
    
    const amount = Math.min(creditor.amount, debtor.amount)
    
    settlements.push({
      from: debtor.person,
      to: creditor.person,
      amount: parseFloat(amount.toFixed(2))
    })
    
    creditor.amount -= amount
    debtor.amount -= amount
    
    if (creditor.amount < 0.01) i++
    if (debtor.amount < 0.01) j++
  }
  
  return settlements
}

/**
 * Group expenses by date
 * @param {Array} expenses - Array of expense objects
 * @returns {Object} Expenses grouped by date
 */
export function groupExpensesByDate(expenses) {
  const grouped = {}
  
  for (const expense of expenses) {
    const date = expense.x_studio_date || 'No date'
    if (!grouped[date]) {
      grouped[date] = []
    }
    grouped[date].push(expense)
  }
  
  return grouped
}

/**
 * Group expenses by type
 * @param {Array} expenses - Array of expense objects
 * @returns {Object} Expenses grouped by type
 */
export function groupExpensesByType(expenses) {
  const grouped = {}
  
  for (const expense of expenses) {
    const type = expense.x_studio_expense_type || 'Other'
    if (!grouped[type]) {
      grouped[type] = []
    }
    grouped[type].push(expense)
  }
  
  return grouped
}

/**
 * Calculate total expenses by person
 * @param {Array} expenses - Array of expense objects
 * @param {Array} partners - Array of partner objects
 * @returns {Object} Total paid and owed by each person
 */
export function calculateTotalsByPerson(expenses, partners = []) {
  const totals = {}
  
  // Create partner map
  const partnerMap = new Map()
  partners.forEach(p => {
    partnerMap.set(p.id, p.display_name)
  })
  
  const getPartnerName = (id) => {
    if (!id) return ''
    if (typeof id === 'number' || typeof id === 'string') {
      return partnerMap.get(Number(id)) || `Partner ${id}`
    }
    if (Array.isArray(id) && id.length >= 2) {
      return String(id[1])
    }
    if (typeof id === 'object' && id.display_name) {
      return id.display_name
    }
    return String(id)
  }
  
  for (const expense of expenses) {
    const amount = parseFloat(String(expense.x_studio_value || 0))
    if (amount <= 0) continue
    
    // Track what payer paid
    const payer = getPartnerName(expense.x_studio_who_paid)
    if (payer) {
      if (!totals[payer]) {
        totals[payer] = { paid: 0, owed: 0, net: 0 }
      }
      totals[payer].paid += amount
    }
    
    // Track what participants owe
    const participantIds = expense.x_studio_participants || []
    const participants = []
    
    if (Array.isArray(participantIds)) {
      for (const pId of participantIds) {
        const name = getPartnerName(pId)
        if (name) participants.push(name)
      }
    }
    
    if (participants.length > 0) {
      const sharePerPerson = amount / participants.length
      participants.forEach((p) => {
        if (!totals[p]) {
          totals[p] = { paid: 0, owed: 0, net: 0 }
        }
        totals[p].owed += sharePerPerson
      })
    }
  }
  
  // Calculate net for each person
  Object.keys(totals).forEach(person => {
    totals[person].paid = Math.round(totals[person].paid * 100) / 100
    totals[person].owed = Math.round(totals[person].owed * 100) / 100
    totals[person].net = Math.round((totals[person].paid - totals[person].owed) * 100) / 100
  })
  
  return totals
}