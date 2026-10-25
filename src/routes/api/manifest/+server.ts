import { pwaManifest } from '$lib/pwa-manifest';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => new Response(
	JSON.stringify(pwaManifest(url.searchParams.get('theme') === 'dark')),
	{ headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-cache' } }
);
