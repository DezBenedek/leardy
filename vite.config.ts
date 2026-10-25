import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';
import { pwaManifest } from './src/lib/pwa-manifest';

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
			injectRegister: false,
			srcDir: 'src',
			mode: 'production',
			strategies: 'injectManifest',
			filename: 'service-worker.ts',
			registerType: 'autoUpdate',
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}', 'client/icons/*.png', 'prerendered/pages/tanulas.html'],
				// Személyes adat nélküli Tanulás-alkalmazásváz az offline induláshoz.
			},
			manifest: pwaManifest(false),
			devOptions: {
				enabled: false
			}
		})
	]
});
