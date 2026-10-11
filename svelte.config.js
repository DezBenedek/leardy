import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Az offline alkalmazásváz a lecke mélyebb URL-jén is ugyanazokat a fájlokat tölti be.
		paths: { relative: false },
		serviceWorker: { register: false },
		adapter: adapter({
			routes: {
				include: ['/*'],
				exclude: ['<build>', '<files>']
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
