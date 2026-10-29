/* A workerd saját 'cloudflare:workers' moduljának minimális típusai.
   Erre azért van szükség, mert a workers-types csomagban lévő
   moduldeklaráció a bundler feloldással nem látszik, futtatóban
   viszont a valódi DurableObject alaposztályt adja a wrangler. */
declare module 'cloudflare:workers' {
	import type { DurableObjectState } from '@cloudflare/workers-types';
	export abstract class DurableObject<Env = unknown> {
		protected ctx: DurableObjectState;
		protected env: Env;
		constructor(ctx: DurableObjectState, env: Env);
		fetch?(request: Request): Response | Promise<Response>;
		webSocketMessage?(ws: WebSocket, message: string | ArrayBuffer): void | Promise<void>;
		webSocketClose?(ws: WebSocket, code: number, reason: string, wasClean: boolean): void | Promise<void>;
		webSocketError?(ws: WebSocket, error: unknown): void | Promise<void>;
	}
}
