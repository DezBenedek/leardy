import { error } from '@sveltejs/kit';
import { contentFetch, offlineIdentity } from '$lib/content-client';
import { readOfflineCatalog } from '$lib/offline-content';
import type { SubjectTree } from '$lib/curriculum';
import type { PageLoad } from './$types';

export const ssr = false;
export const load: PageLoad = async ({ params }) => {
	try {
		const response = await contentFetch(`/api/browse?subject=${encodeURIComponent(params.id)}`);
		if (response.ok) return { tree: (await response.json()).tree as SubjectTree };
		if (response.status === 404 || response.status === 410) error(response.status, 'Nincs ilyen tantárgy.');
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
	}
	const tree = (await readOfflineCatalog(offlineIdentity()?.id)).trees[params.id];
	if (!tree) error(503, 'Ez a tantárgy még nincs elmentve ezen az eszközön.');
	return { tree };
};
