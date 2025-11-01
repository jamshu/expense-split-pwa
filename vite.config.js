import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Expense Split PWA',
        short_name: 'ExpenseSplit',
        description: 'Offline-first expense splitting app',
        theme_color: '#667eea',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf,eot}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(png|jpg|jpeg|svg|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: {
    proxy: {
      '/api/odoo': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy, options) => {
          // Mock API responses during development
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            
            // Mock responses based on request body
            let body = ''
            req.on('data', chunk => {
              body += chunk.toString()
            })
            req.on('end', () => {
              try {
                const { action, data } = JSON.parse(body)
                let response = { success: true }
                
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
                    response.results = []
                    break
                  case 'create':
                    response.id = Math.floor(Math.random() * 1000)
                    break
                  case 'update':
                  case 'delete':
                    response.result = true
                    break
                  default:
                    response.results = []
                }
                
                res.end(JSON.stringify(response))
              } catch (e) {
                res.end(JSON.stringify({ success: false, error: 'Invalid request' }))
              }
            })
          })
        }
      }
    }
  }
})
