import { invalidate } from './query.svelte';
import { contentFetch } from './content-client';

/** Sikeres mentés után csak az érintett kezdőlapi gyorstárat érvénytelenítjük. */
export async function mutationFetch(url: string, init: RequestInit): Promise<Response> {
	const response = await fetch(url, init);
	if (!response.ok || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method?.toUpperCase() ?? '')) return response;
	const path = url.split('?')[0];
	if (/^\/api\/(?:library|decks|deck-cards)(?:\/|$)/.test(path)) invalidate('sm2-due');
	if (/^\/api\/(?:library|decks|deck-cards)(?:\/|$)/.test(path)) {
		// A mentés sikere után a teljes kártyatartalom is kerüljön a helyi könyvtárba.
		await contentFetch('/api/library').catch(() => undefined);
		invalidate('library');
	}
	if (path === '/api/progress') invalidate('home', { exact: true });
	if (/^\/api\/classrooms(?:\/[^/]+(?:\/(?:leave|members|tasks|assignments)(?:\/.*)?)?)?$/.test(path)) {
		invalidate('home-tasks', { exact: true });
	}
	return response;
}
