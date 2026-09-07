// SvelteKit + Cloudflare típusok. Az `Env` interfészt a `pnpm types`
// (wrangler types) generálja a wrangler.jsonc alapján — kézzel nem írjuk.
declare global {
	namespace App {
		interface Platform {
			env: Env;
			context: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}
	}
}

export {};
