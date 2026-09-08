import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	define: {
		__APP_BUILD_TIME__: JSON.stringify(new Date().toISOString())
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			srcDir: 'src',
			mode: 'production',
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			manifest: {
				name: 'Leardy — Tanulj okosan',
				short_name: 'Leardy',
				description: 'Modern tanuló app: leckék, szókártyák és tanterem — bárhol, bármikor.',
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
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				navigateFallbackDenylist: [/^\/api\//]
			},
			devOptions: {
				enabled: false
			}
		})
	]
});
