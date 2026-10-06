import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		host: true,
		allowedHosts: true
	},
	define: {
		__APP_BUILD_TIME__: JSON.stringify(new Date().toISOString())
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			srcDir: 'src',
			mode: 'production',
			strategies: 'injectManifest',
			filename: 'service-worker.ts',
			registerType: 'autoUpdate',
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}', 'client/icons/*.png'],
				// Az API soha nem mehet service-worker-cache-be: az élő dolgozat
				// pollingja és a pontozás mindig hálózatról jön.
			},
			manifest: {
				name: 'Leardy: Tanulj okosan',
				short_name: 'Leardy',
				description: 'Modern tanuló app leckékkel, szókártyákkal és tanteremmel. Bárhol, bármikor.',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				orientation: 'portrait',
				background_color: '#ffffff',
				theme_color: '#4255ff',
				lang: 'hu',
				categories: ['education'],
				icons: [
					{
						src: 'icons/icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: 'icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: 'icons/maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			devOptions: {
				enabled: false
			}
		})
	]
});
