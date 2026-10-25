import type { ExportedHandler } from '@cloudflare/workers-types';
// A SvelteKit által előállított HTTP-kezelő a build után érhető el.
// @ts-expect-error A generált JavaScript-modulhoz nincs típusdeklaráció.
import app from './.svelte-kit/cloudflare/_worker.js';
import { runPushSchedule } from './src/lib/server/push-scheduler';

export default {
	fetch: app.fetch,
	async scheduled(controller, env) {
		await runPushSchedule(env.DB, controller.scheduledTime);
	}
} satisfies ExportedHandler<Cloudflare.Env>;
