import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			routes: {
				include: ['/*'],
				exclude: ['<all>']
			},
			// Lokális D1 perzisztencia: a `vite dev` ugyanoda írja az adatot,
			// ahova a `wrangler d1 ... --local` is (.wrangler/state/v3),
			// ezért újraindítás után is megmarad minden.
			platformProxy: {
				persist: true
			}
		}),
		alias: {
			$lib: './src/lib'
		}
	}
};

export default config;
