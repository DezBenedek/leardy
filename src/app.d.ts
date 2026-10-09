/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/info" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			classroomDetail?: { kind: 'message' | 'task' | 'assignment'; id: string } | null;
		}
		interface Platform {
			env: {
				DB: D1Database;
				UPLOADS?: R2Bucket;
				AWS_REGION?: string;
				AWS_ACCESS_KEY_ID?: string;
				AWS_SECRET_ACCESS_KEY?: string;
				SES_FROM_EMAIL?: string;
				GOOGLE_CLIENT_ID?: string;
				GOOGLE_CLIENT_SECRET?: string;
			};
		}
	}
}

export {};
