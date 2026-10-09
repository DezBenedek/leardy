import { browser } from '$app/environment';

const KEY = 'leardy-lesson-sections';
type SectionStates = Record<string, boolean>;

export function loadLessonSections(id: string): SectionStates | null {
	if (!browser) return null;
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')[id];
		if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
		return Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
	} catch { return null; }
}

export function saveLessonSections(id: string, sections: SectionStates): void {
	if (!browser) return;
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		delete saved[id];
		const recent = Object.fromEntries(Object.entries(saved).slice(-99));
		localStorage.setItem(KEY, JSON.stringify({ ...recent, [id]: sections }));
	} catch { /* Tiltott vagy megtelt tárhely esetén a lecke tovább használható. */ }
}
