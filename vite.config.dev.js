import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webp}']
			},
			manifest: false // Using static manifest.json
		})
	],
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:5173',
				changeOrigin: true
			}
		}
	}
});
