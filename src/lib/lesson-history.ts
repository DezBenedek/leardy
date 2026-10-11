import { browser } from '$app/environment';

/* Utoljára megnyitott lecke naplója (localStorage: leardy-lesson-opened).
   A Tanulás oldal Folytatás gombja ebből nyitja meg ott, ahol abbahagytad.
   Csak az azonosítót és a címet tároljuk, eszközönkénti lista. */

const KEY = 'leardy-lesson-opened';

export interface LastLesson {
	id: string;
	title: string;
	at: number;
}

export function loadLastLesson(): LastLesson | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<LastLesson>;
		if (!parsed || typeof parsed.id !== 'string' || !parsed.id) return null;
		return {
			id: parsed.id,
			title: typeof parsed.title === 'string' ? parsed.title : '',
			at: typeof parsed.at === 'number' ? parsed.at : 0
		};
	} catch {
		return null;
	}
}

export function markLessonOpened(id: string, title = ''): void {
	if (!browser || !id) return;
	try {
		localStorage.setItem(KEY, JSON.stringify({ id, title, at: Date.now() }));
	} catch {
		// tiltott storage: nincs mit tenni
	}
}
