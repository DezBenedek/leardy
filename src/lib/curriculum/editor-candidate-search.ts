import type { EditorCandidate } from './curriculum-editor';

export interface EditorSearchResult {
	users: EditorCandidate[];
	hasMore: boolean;
}

/** Csak teljes eredményből szűrünk tovább, hogy a levágott találatok se vesszenek el. */
function matchesCandidate(user: EditorCandidate, query: string): boolean {
	return user.email.toLowerCase().includes(query) || user.name.toLowerCase().includes(query);
}

export function cachedEditorSearch(cache: ReadonlyMap<string, EditorSearchResult>, query: string): EditorSearchResult | undefined {
	const exact = cache.get(query);
	if (exact) return exact;
	for (const [previousQuery, result] of cache) {
		if (!result.hasMore && query.includes(previousQuery)) {
			return { users: result.users.filter((user) => matchesCandidate(user, query)), hasMore: false };
		}
	}
	return undefined;
}
