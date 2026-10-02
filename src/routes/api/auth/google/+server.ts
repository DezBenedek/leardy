import { redirect, type RequestHandler } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import {
	buildGoogleAuthUrl,
	getGoogleEnv,
	randomState,
	type GoogleEnv
} from '$lib/server/google-auth';

const STATE_COOKIE = 'leardy_oauth_state';

/* Belépés indítása: átirányítás a Google beleegyező képernyőre.
   A state CSRF token httpOnly sütiben, 10 percre. */
export const GET: RequestHandler = async (event) => {
	// Élesben platform env (wrangler secret), helyi vite devben .env fájl.
	const env = {
		...((privateEnv ?? {}) as GoogleEnv),
		...((event.platform?.env ?? {}) as GoogleEnv)
	};
	const creds = getGoogleEnv(env);
	if (!creds) {
		throw redirect(303, '/?auth_error=config');
	}
	const redirectUri = new URL('/api/auth/google/callback', event.url.origin).toString();
	const state = randomState();
	event.cookies.set(STATE_COOKIE, state, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		maxAge: 600
	});
	throw redirect(303, buildGoogleAuthUrl({ clientId: creds.clientId, redirectUri, state }));
};
