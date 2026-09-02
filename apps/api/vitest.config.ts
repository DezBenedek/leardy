import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				// Pool workerd currently caps at 2026-08-22; wrangler.jsonc stays 2026-09-02.
				compatibilityDate: "2026-08-22",
			},
		}),
	],
});
