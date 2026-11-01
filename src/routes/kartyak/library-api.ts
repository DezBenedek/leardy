import { contentFetch } from '$lib/content/content-client';
import type { LevelNode, Package, Subject } from '$lib/curriculum/curriculum';

export async function fetchSubjectsRaw(cacheOnly = false): Promise<Subject[]> {
	const res = await contentFetch('/api/browse', cacheOnly);
	if (!res.ok) throw new Error(`http ${res.status}`);
	const j = await res.json();
	return res.ok ? (j.subjects ?? []) : [];
}

export async function fetchLevelsRaw(id: string, cacheOnly = false): Promise<LevelNode[]> {
	const res = await contentFetch(`/api/browse?subject=${encodeURIComponent(id)}`, cacheOnly);
	if (!res.ok) throw new Error(`http ${res.status}`);
	const j = await res.json();
	return res.ok && j.tree ? (j.tree.levels ?? []) : [];
}

export async function fetchLibraryRaw(): Promise<Package[]> {
	const res = await contentFetch('/api/library');
	if (!res.ok) throw new Error(`http ${res.status}`);
	return (await res.json()).packages ?? [];
}
