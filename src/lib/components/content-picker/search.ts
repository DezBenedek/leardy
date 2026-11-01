/** Ékezet-érzéketlen kereséshez. */
export function norm(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

export function matches(hay: string, query: string): boolean {
	const q = norm(query.trim());
	return q === '' || norm(hay).includes(q);
}
