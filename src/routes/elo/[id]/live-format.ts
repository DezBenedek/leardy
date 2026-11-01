import type { QuizQuestion } from '$lib/curriculum/curriculum';
import { Circle as CircleIcon, Diamond, Square, Triangle } from '@lucide/svelte';
import type { LiveParticipant } from './live-types';

/** Kahoot-színek és formák a táblához és a diákválaszokhoz. */
export const kahootTiles = [
	{ bg: '#E21B3C', Icon: Triangle },
	{ bg: '#1368CE', Icon: Diamond },
	{ bg: '#D89E00', Icon: CircleIcon },
	{ bg: '#26890C', Icon: Square }
];

export const avatarTones = [
	'bg-brand-500/10 text-brand-600 dark:text-brand-400',
	'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
	'bg-amber-500/10 text-amber-600 dark:text-amber-300',
	'bg-rose-500/10 text-rose-600 dark:text-rose-300',
	'bg-sky-500/10 text-sky-600 dark:text-sky-300'
];

export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pctOf(p: LiveParticipant, questionsLength: number): number {
	const total = p.total ?? questionsLength;
	if (!total || total <= 0) return 0;
	return Math.round(((p.correct ?? p.score ?? 0) / total) * 100);
}

/** Válasz szépítése a részletezőbe: JSON tömb helyett olvasható felsorolás. */
export function prettyAnswer(questions: QuizQuestion[], questionIdx: number, raw: string): string {
	const text = String(raw ?? '');
	if (!text) return 'Nincs válasz';
	try {
		const parsed: unknown = JSON.parse(text);
		if (Array.isArray(parsed)) {
			const items = parsed.map((x) => String(x));
			const q = questions[questionIdx];
			return items.join(q?.type === 'order' ? ' → ' : ' · ');
		}
	} catch {
		// nem JSON: nyers szöveg
	}
	return text;
}
