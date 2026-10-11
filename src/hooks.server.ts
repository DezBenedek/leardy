import type { Handle } from '@sveltejs/kit';

/** Alap biztonsági fejlécek minden válaszra (PWA-barát, mikrofont engedélyezi). */
export const handle: Handle = async ({ event, resolve }) => {
	const res = await resolve(event);
	res.headers.set('X-Content-Type-Options', 'nosniff');
	res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	res.headers.set('X-Frame-Options', 'SAMEORIGIN');
	res.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
	return res;
};
