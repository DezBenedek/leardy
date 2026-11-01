import { browser } from '$app/environment';

/* Közös app-beállítások (localStorage: leardy-settings).
   A beállítások oldal írja, a QuickPractice és társai olvassák. */

export type FontFamilyChoice = 'system' | 'modern' | 'book' | 'excalifont';

export interface AppSettings {
	reminder: boolean;
	/** Napi emlékeztető időpontja "HH:MM" formátumban. Minden nap szól. */
	reminderTime: string;
	/** Push értesítések: új tantermi üzenet, új tantermi feladat, új jegy, új funkciók. */
	pushClassMessage: boolean;
	pushClassTask: boolean;
	pushGrades: boolean;
	pushFeatures: boolean;
	/** Határidő-emlékeztető: 24 órán belül lejáró tantermi feladat/beadandó. */
	dueSoon: boolean;
	/** Némított osztályok id listája: innen nem jön tantermi értesítés. */
	mutedClassrooms: string[];
	/** @deprecated Mar nem hasznaljuk az ertesiteseknel, csak migracios okbol marad. */
	sounds: boolean;
	autoAudio: boolean;
	/** Véletlen gyors-kvíz kérdésszáma (1-50). */
	quickQuizCount: number;
	/** Betűtípus: rendszer (telefon alapja), modern, könyvszerű vagy Excalifont. */
	fontFamily: FontFamilyChoice;
	/** Mozgás csökkentése: kikapcsolja az animációkat. */
	reduceMotion: boolean;
	/** Kompakt lista: sűrűbb kártya- és leckelista. */
	compactList: boolean;
	/** Minden bekezdés kinyitása a lecke megnyitásakor. */
	openAllLessonSections: boolean;
	/** A szerkesztő tartalommezői teljes magasságban indulnak. */
	expandEditorTextareas: boolean;
	/** Szógyakorlás szakasz a főoldalon. */
	homeWords: boolean;
	/** Kikapcsolt nyelvek a főoldali szógyakorlásnál (tantárgy azonosítók). */
	hiddenWordSubjects: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
	reminder: true,
	reminderTime: '20:00',
	dueSoon: true,
	mutedClassrooms: [],
	pushClassMessage: true,
	pushClassTask: true,
	pushGrades: true,
	pushFeatures: true,
	sounds: false,
	autoAudio: false,
	quickQuizCount: 10,
	fontFamily: 'system',
	reduceMotion: false,
	compactList: false,
	openAllLessonSections: false,
	expandEditorTextareas: false,
	homeWords: true,
	hiddenWordSubjects: []
};

function clampCount(n: unknown): number {
	const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : NaN;
	if (Number.isNaN(v)) return DEFAULT_SETTINGS.quickQuizCount;
	return Math.min(50, Math.max(1, v));
}

function clampTime(t: unknown): string {
	if (typeof t !== 'string') return DEFAULT_SETTINGS.reminderTime;
	const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
	if (!m) return DEFAULT_SETTINGS.reminderTime;
	const h = String(Number(m[1])).padStart(2, '0');
	return `${h}:${m[2]}`;
}

function clampMuted(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	const ids = v.filter((x) => typeof x === 'string' && (x as string).trim() !== '') as string[];
	return [...new Set(ids)].slice(0, 200);
}

function clampFontFamily(v: unknown): FontFamilyChoice {
	return v === 'modern' || v === 'book' || v === 'excalifont' ? v : 'system';
}

function clampIdList(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	const ids = v.filter((x) => typeof x === 'string' && (x as string).trim() !== '') as string[];
	return [...new Set(ids)].slice(0, 50);
}

export function loadSettings(): AppSettings {
	if (!browser) return { ...DEFAULT_SETTINGS };
	try {
		const raw = localStorage.getItem('leardy-settings');
		if (!raw) return { ...DEFAULT_SETTINGS };
		const parsed = JSON.parse(raw) as Partial<AppSettings>;
		return {
			reminder: parsed.reminder ?? DEFAULT_SETTINGS.reminder,
			reminderTime: clampTime(parsed.reminderTime),
			dueSoon: parsed.dueSoon ?? DEFAULT_SETTINGS.dueSoon,
			mutedClassrooms: clampMuted(parsed.mutedClassrooms),
			pushClassMessage: parsed.pushClassMessage ?? DEFAULT_SETTINGS.pushClassMessage,
			pushClassTask: parsed.pushClassTask ?? DEFAULT_SETTINGS.pushClassTask,
			pushGrades: parsed.pushGrades ?? DEFAULT_SETTINGS.pushGrades,
			pushFeatures: parsed.pushFeatures ?? DEFAULT_SETTINGS.pushFeatures,
			sounds: parsed.sounds ?? DEFAULT_SETTINGS.sounds,
			autoAudio: parsed.autoAudio ?? DEFAULT_SETTINGS.autoAudio,
			quickQuizCount: clampCount(parsed.quickQuizCount),
			fontFamily: clampFontFamily(parsed.fontFamily),
			reduceMotion: parsed.reduceMotion ?? DEFAULT_SETTINGS.reduceMotion,
			compactList: parsed.compactList ?? DEFAULT_SETTINGS.compactList,
			openAllLessonSections: parsed.openAllLessonSections === true,
			expandEditorTextareas: parsed.expandEditorTextareas === true,
			homeWords: parsed.homeWords ?? DEFAULT_SETTINGS.homeWords,
			hiddenWordSubjects: clampIdList(parsed.hiddenWordSubjects)
		};
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export function saveSettings(s: AppSettings): void {
	if (!browser) return;
	try {
		localStorage.setItem('leardy-settings', JSON.stringify(s));
	} catch {
		// tiltott storage: nincs mit tenni
	}
	syncNotifPrefs(s);
}

/** A zárt app push a szerveren szűr: némítás és kapcsolók felküldése. */
export async function syncNotifPrefs(s: AppSettings = loadSettings()): Promise<boolean> {
	if (!browser) return false;
	return fetch('/api/push/prefs', {
		method: 'PUT',
		credentials: 'same-origin',
		keepalive: true,
		signal: AbortSignal.timeout(10_000),
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			messages: s.pushClassMessage,
			tasks: s.pushClassTask,
			grades: s.pushGrades,
			reminder: s.reminder,
			reminderTime: s.reminderTime,
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			dueSoon: s.dueSoon,
			muted: s.mutedClassrooms
		})
	}).then((response) => response.ok).catch(() => false);
}

/** Némított-e az adott osztály (nem jön onnan tantermi értesítés). */
export function isClassroomMuted(s: AppSettings, classroomId: string): boolean {
	return s.mutedClassrooms.includes(classroomId);
}

/** Osztály némítása / feloldása, új listával tér vissza. */
export function toggleClassroomMuted(s: AppSettings, classroomId: string): string[] {
	if (!classroomId) return s.mutedClassrooms;
	return s.mutedClassrooms.includes(classroomId)
		? s.mutedClassrooms.filter((id) => id !== classroomId)
		: [...s.mutedClassrooms, classroomId].slice(0, 200);
}
