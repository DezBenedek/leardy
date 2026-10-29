import type { DurableObjectNamespace, ExportedHandler } from '@cloudflare/workers-types';
// A SvelteKit által előállított HTTP-kezelő a build után érhető el.
// @ts-expect-error A generált JavaScript-modulhoz nincs típusdeklaráció.
import app from './.svelte-kit/cloudflare/_worker.js';
import { runPushSchedule } from './src/lib/server/push-scheduler';
import { LiveRoom } from './src/lib/server/live-do';

export { LiveRoom };

export default {
	async fetch(request, env, ctx) {
		try {
			const url = new URL(request.url);
			if (url.pathname.startsWith('/api/live/socket/')) {
				const id = url.pathname.split('/').filter(Boolean).pop() ?? 'elo';
				const ns = (env as unknown as { LIVE?: DurableObjectNamespace }).LIVE;
				if (!ns) {
					return new Response(JSON.stringify({ error: 'Az élő modul nem elérhető.' }), {
						status: 503,
						headers: { 'content-type': 'application/json' }
					});
				}
				const stub = ns.get(ns.idFromName(id));
				return stub.fetch(request);
			}
		} catch {
			// útvonalhiba esetén a SvelteKit válaszol
		}
		return app.fetch(request, env, ctx);
	},
	async scheduled(controller, env) {
		await runPushSchedule(env.DB, controller.scheduledTime);
	}
} satisfies ExportedHandler<Cloudflare.Env>;
