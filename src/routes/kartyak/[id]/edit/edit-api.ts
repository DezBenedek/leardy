import type { LevelNode, Subject } from '$lib/curriculum/curriculum';

export async function readError(res: Response, fallback: string): Promise<string> {
	try {
		const j = await res.json();
		if (typeof j?.error === 'string' && j.error) return j.error;
	} catch {
		// JSON nélküli válasz
	}
	return fallback;
}

export async function fetchSubjectsRaw(): Promise<Subject[]> {
	try {
		const res = await fetch('/api/browse');
		const j = await res.json();
		return res.ok ? (j.subjects ?? []) : [];
	} catch {
		return [];
	}
}

export async function fetchLevelsRaw(subject: string): Promise<LevelNode[]> {
	if (!subject) return [];
	try {
		const res = await fetch(`/api/browse?subject=${encodeURIComponent(subject)}`);
		const j = await res.json();
		return res.ok && j.tree ? (j.tree.levels ?? []) : [];
	} catch {
		return [];
	}
}

export async function fetchDeckRaw(deckId: string): Promise<Response> {
	return fetch(`/api/decks/${encodeURIComponent(deckId)}`);
}
