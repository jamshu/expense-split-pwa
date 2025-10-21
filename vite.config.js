import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.PUBLIC_BASE_PATH || '';

export default defineConfig({
	base,
	plugins: [
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			base,
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webp}'],
				navigateFallback: null
			},
			manifest: {
				name: 'Expense Split',
				short_name: 'Expense Split',
				description: 'A PWA for splitting expenses',
				start_url: base ? `${base}/` : '/',
				scope: base ? `${base}/` : '/',
				display: 'standalone',
				background_color: '#ffffff',
				theme_color: '#ffffff',
				icons: [
					{
						src: base ? `${base}/icon-192.png` : '/icon-192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any maskable'
					},
					{
						src: base ? `${base}/icon-512.png` : '/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable'
					}
				]
			}
		})
	]
});
