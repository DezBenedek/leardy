import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = async ({ params, fetch, parent }) => {
	const { user } = await parent();
	const res = await fetch(`/api/live/${encodeURIComponent(params.id)}`);
	const room = await res.json().catch(() => ({}));
	if (!res.ok) error(res.status, room.error ?? 'Az élő dolgozat nem érhető el.');
	return { liveId: params.id, room, user };
};
