export interface CardRow {
	key: number;
	id: string | null;
	front: string;
	back: string;
	sectionSlug: string;
	orig: { front: string; back: string; section: string } | null;
}

/** A tananyagválasztó egységes címkéje. */
export const levelLabel = 'Tananyag';

export const frontLabel = 'Kifejezés';
export const backLabel = 'Definíció';

export function norm(s: string): string {
	return s.trim();
}
