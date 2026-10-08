import { clearPersistedCache, invalidate } from '$lib/query.svelte';

export async function editCurriculum<T = { id?: string }>(body: Record<string, unknown>): Promise<T> {
	const response = await fetch('/api/curriculum', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const result = await response.json();
	if (!response.ok) throw new Error(result.message ?? result.error ?? 'Nem sikerült menteni a módosítást.');
	for (const prefix of ['tree:', 'subjects', 'levels:', 'packages:', 'disc-', 'counts:', 'home']) invalidate(prefix);
	clearPersistedCache();
	return result as T;
}
