import type { Package } from '$lib/curriculum/curriculum';
import { deckCardKindLabel } from '$lib/curriculum/curriculum';
import { normHu } from '$lib/deck/deck-history';

export interface LibSortOption {
	id: string;
	title: string;
	desc: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	icon: any;
}

export const LIB_SORT_KEY = 'leardy-kartyak-libsort';

export function loadLibSort(): string {
	if (typeof localStorage === 'undefined') return 'recent';
	const v = localStorage.getItem(LIB_SORT_KEY);
	return v === 'name' || v === 'cards' ? v : 'recent';
}

export function pkgHaystack(p: Package): string {
	const attached = (p.attachedLessons ?? []).map((a) => a.title).join(' ');
	return normHu(
		[p.title, p.subjectTitle, p.levelTitle, p.attachedLessonTitle, attached, p.lessonTitle, p.materialTitle]
			.filter(Boolean)
			.join(' ')
	);
}

/** Leírás sor: ami szűrőként ki van választva (tantárgy/tananyag), az nem
   ismétlődik minden sorban; a csatolt lecke sem, ha a cím már tartalmazza. */
export function describe(p: Package, subjectId: string, levelId: string): string {
	const kindLabel = deckCardKindLabel(p.cardKind);
	if (!p.subjectId)
		return `${p.mine ? 'Besorolatlan saját csomag' : 'Publikált csomag'} · ${kindLabel} · ${p.questionCount} kártya`;
	const parts: string[] = [];
	if (!p.mine && p.quizId.startsWith('deck:')) parts.push('Publikált');
	if (p.subjectTitle && !(subjectId && p.subjectId === subjectId)) parts.push(p.subjectTitle);
	if (p.levelTitle && !(levelId && p.levelId === levelId)) parts.push(p.levelTitle);
	const attachedTitles = (p.attachedLessons ?? [])
		.map((a) => a.title)
		.filter((t) => t && !p.title.startsWith(t));
	const legacyAttached =
		p.attachedLessonTitle && !p.title.startsWith(p.attachedLessonTitle) ? [p.attachedLessonTitle] : [];
	const allAttached = attachedTitles.length > 0 ? attachedTitles : legacyAttached;
	if (allAttached.length === 1) parts.push(allAttached[0]);
	else if (allAttached.length > 1) parts.push(`${allAttached.length} leckéhez csatolva`);
	parts.push(kindLabel);
	parts.push(`${p.questionCount} kártya`);
	return parts.join(' · ');
}

/* A részletező vissza-nyila ide tér vissza, ha innen nyitották meg. */
export function markFromLibrary() {
	try {
		sessionStorage.setItem('kartyak-detail-back', '/kartyak');
	} catch {
		// tiltott storage
	}
}
