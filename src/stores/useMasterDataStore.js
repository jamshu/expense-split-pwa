import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dbOps } from '../db'
import { odooApi } from '../services/odooApi'

export const useMasterDataStore = defineStore('masterData', () => {
  // State
  const partners = ref([])
  const expenseGroups = ref([])
  const loading = ref(false)
  const error = ref(null)
  const lastSyncTime = ref(null)
  
  // Actions
  async function loadMasterData() {
    loading.value = true
    error.value = null
    try {
      // Load from local database first
      partners.value = await dbOps.getPartners()
      expenseGroups.value = await dbOps.getExpenseGroups()
      lastSyncTime.value = await dbOps.getSetting('lastSync')
      
      // If no local data, try to fetch from server
      if (partners.value.length === 0 && navigator.onLine) {
        await fetchMasterData()
      }
    } catch (err) {
      error.value = err.message
      console.error('Failed to load master data:', err)
    } finally {
      loading.value = false
    }
  }
  
  async function fetchMasterData() {
    if (!navigator.onLine) {
      throw new Error('No internet connection')
    }
    
    loading.value = true
    error.value = null
    try {
      // Fetch from Odoo API
      const [fetchedPartners, fetchedGroups] = await Promise.all([
        odooApi.fetchPartners(),
        odooApi.fetchExpenseGroups()
      ])
      
      // Save to local database
      partners.value = await dbOps.savePartners(fetchedPartners)
      expenseGroups.value = await dbOps.saveExpenseGroups(fetchedGroups)
      
      // Update last sync time
      const now = new Date().toISOString()
      await dbOps.setSetting('lastSync', now)
      lastSyncTime.value = now
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch master data:', err)
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function getGroupMembers(groupId) {
    const group = expenseGroups.value.find(g => g.id === groupId)
    if (!group) return []
    
    // Extract member IDs from x_studio_members field
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
    
    // Return partners that are members of this group
    return partners.value.filter(p => memberIds.includes(p.id))
  }
  
  function getPartnerById(id) {
    return partners.value.find(p => p.id === Number(id))
  }
  
  function getGroupById(id) {
    return expenseGroups.value.find(g => g.id === Number(id))
  }
  
  return {
    // State
    partners,
    expenseGroups,
    loading,
    error,
    lastSyncTime,
    
    // Actions
    loadMasterData,
    fetchMasterData,
    getGroupMembers,
    getPartnerById,
    getGroupById
  }
})