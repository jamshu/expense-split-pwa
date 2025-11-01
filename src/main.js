import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import './style.css'
import App from './App.vue'
import { initializeDatabase } from './db'
import { syncService } from './services/syncService'

// Initialize the app
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Initialize database and start sync
initializeDatabase().then(() => {
  console.log('Database initialized')
  
  // Start auto-sync if online
  if (navigator.onLine) {
    syncService.startAutoSync(30000) // Sync every 30 seconds
  }
  
  // Listen for online/offline events
  window.addEventListener('online', () => {
    console.log('Back online - starting sync')
    syncService.startAutoSync(30000)
  })
  
  window.addEventListener('offline', () => {
    console.log('Gone offline - stopping sync')
    syncService.stopAutoSync()
  })
})

app.mount('#app')
