<script setup>
import { ref, onMounted } from 'vue'
import { RouterView, RouterLink } from 'vue-router'
import { useExpenseStore } from './stores/useExpenseStore'
import { useMasterDataStore } from './stores/useMasterDataStore'

const expenseStore = useExpenseStore()
const masterDataStore = useMasterDataStore()
const isOnline = ref(navigator.onLine)
const showMenu = ref(false)

// Load initial data
onMounted(async () => {
  await masterDataStore.loadMasterData()
  await expenseStore.loadExpenses()
})

// Watch online status
window.addEventListener('online', () => {
  isOnline.value = true
})

window.addEventListener('offline', () => {
  isOnline.value = false
})
</script>

<template>
  <div id="app">
    <!-- Header -->
    <header class="app-header">
      <div class="header-content">
        <button @click="showMenu = !showMenu" class="menu-toggle">
          ☰
        </button>
        <h1>Expense Split</h1>
        <div class="status-indicator">
          <span class="status-dot" :class="{ online: isOnline, offline: !isOnline }"></span>
          {{ isOnline ? 'Online' : 'Offline' }}
        </div>
      </div>
    </header>

    <!-- Navigation Menu -->
    <nav class="nav-menu" :class="{ show: showMenu }">
      <RouterLink to="/" @click="showMenu = false">Expenses</RouterLink>
      <RouterLink to="/expense/new" @click="showMenu = false">Add Expense</RouterLink>
      <RouterLink to="/balance" @click="showMenu = false">Balance</RouterLink>
      <RouterLink to="/reports" @click="showMenu = false">Reports</RouterLink>
      <RouterLink to="/settings" @click="showMenu = false">Settings</RouterLink>
    </nav>

    <!-- Main Content -->
    <main class="main-content">
      <RouterView />
    </main>

    <!-- Sync Status -->
    <div v-if="expenseStore.syncStatus === 'syncing'" class="sync-indicator">
      Syncing...
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: #f5f5f5;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.menu-toggle {
  background: none;
  border: none;
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.5rem;
}

.app-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #ccc;
}

.status-dot.online {
  background-color: #4ade80;
}

.status-dot.offline {
  background-color: #f87171;
}

.nav-menu {
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  gap: 1rem;
  padding: 0 1rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  overflow-x: auto;
}

.nav-menu a {
  display: block;
  padding: 1rem;
  color: #333;
  text-decoration: none;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: all 0.3s;
}

.nav-menu a:hover {
  color: #667eea;
  border-bottom-color: #667eea;
}

.nav-menu a.router-link-active {
  color: #667eea;
  border-bottom-color: #667eea;
}

.main-content {
  flex: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
  width: 100%;
}

.sync-indicator {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background: #667eea;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 2rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@media (max-width: 768px) {
  .nav-menu {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    flex-direction: column;
    background: white;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform 0.3s;
    padding: 4rem 1rem 1rem;
  }
  
  .nav-menu.show {
    transform: translateX(0);
  }
  
  .nav-menu a {
    font-size: 1.125rem;
    border-bottom: 1px solid #e5e7eb;
  }
}
</style>
