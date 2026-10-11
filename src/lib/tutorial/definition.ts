export const TUTORIAL_VERSION = 1;
export const TOUR_IDS = ['basics', 'learning', 'classroom', 'cards'] as const;
export type TourId = typeof TOUR_IDS[number];
export type TourStatus = 'active' | 'paused' | 'skipped' | 'completed';
export interface TourContext {
	subjectId?: string;
	levelId?: string;
	levelLabel?: string;
	lessonId?: string;
	roomId?: string;
	packageId?: string;
}
export interface TourRecord {
	tourId: TourId;
	version: number;
	status: TourStatus;
	stepId: string;
	context: TourContext;
	revision: number;
	operationId: string;
	updatedAt: number;
}
export interface TourMutation extends Omit<TourRecord, 'updatedAt'> {
	restart?: boolean;
}
export interface TourStep {
	id: string;
	title: string;
	text: string;
	target: string;
	page: 'home' | 'learning' | 'lesson' | 'classroom' | 'room' | 'cards' | 'discovery' | 'package' | 'settings';
	event?: string;
	to?: TourStep['page'];
	optional?: boolean;
}
const target = (id: string) => '[data-tutorial="' + id + '"]';
const home: TourStep = { id: 'home', title: 'Minden egy helyen', text: 'Itt látod a következő teendődet és a tanulási sorozatodat.', target: target('home-overview'), page: 'home' };
const navLearning: TourStep = { id: 'nav-learning', title: 'Induljunk tanulni!', text: 'A leckéket a Tanulás menüben találod. Nyisd meg!', target: target('nav-learning'), page: 'home', event: 'navigation', to: 'learning' };
const scope: TourStep = { id: 'scope-open', title: 'Válassz tananyagot!', text: 'Ezzel a gombbal választhatsz tantárgyat és tananyagot. Nyisd meg a választót!', target: target('scope-open'), page: 'learning', event: 'scope-open' };
const subject: TourStep = { id: 'scope-subject', title: 'Mi érdekel?', text: 'Válassz egy tantárgyat a kiemelt lehetőségek közül!', target: target('scope-subject') + ':not(:disabled)', page: 'learning', event: 'scope-subject' };
const level: TourStep = { id: 'scope-level', title: 'Melyik tananyag?', text: 'Válaszd ki, melyik tananyaggal foglalkoznál!', target: target('scope-level') + ':not(:disabled)', page: 'learning', event: 'scope-level' };
const lesson: TourStep = { id: 'lesson-open', title: 'Nyiss meg egy leckét!', text: 'A leckék témakörökbe rendezve jelennek meg. Koppints a kiemelt leckére!', target: target('lesson-link'), page: 'learning', event: 'navigation', to: 'lesson', optional: true };
const section: TourStep = { id: 'lesson-section', title: 'Olvass a saját tempódban!', text: 'A lecke részeit külön is kinyithatod és összecsukhatod. A kiemelt részben találod a tananyagot.', target: target('lesson-section'), page: 'lesson', optional: true };
const quiz: TourStep = { id: 'lesson-quiz', title: 'Ellenőrizd a tudásodat!', text: 'A dobókocka ikonnal a teljes leckét gyakorolhatod. Most csak megmutatjuk, hol találod.', target: target('lesson-quiz'), page: 'lesson', optional: true };
const navClassroom: TourStep = { id: 'nav-classroom', title: 'Az osztályaid helye', text: 'Nyisd meg a Tantermet! Itt találod a tanáraid által megosztott feladatokat.', target: target('nav-classroom'), page: 'lesson', event: 'navigation', to: 'classroom' };
const rooms: TourStep = { id: 'classroom-overview', title: 'Csatlakozz az osztályodhoz!', text: 'Itt jelennek meg az osztályaid. A + gombbal, a tanárodtól kapott kóddal csatlakozhatsz. Most nem kell kódot megadnod.', target: target('classroom-overview'), page: 'classroom' };
const navCards: TourStep = { id: 'nav-cards', title: 'Ismétlés kártyákkal', text: 'A kártyákkal ismételhetsz és szavakat gyakorolhatsz. Nyisd meg a Kártyák menüt!', target: target('nav-cards'), page: 'classroom', event: 'navigation', to: 'cards' };
const cards: TourStep = { id: 'cards-overview', title: 'A kártyagyűjteményed', text: 'Itt találod a csomagjaidat. A + gomb alatt a Felfedezésből kereshetsz továbbiakat.', target: target('cards-overview'), page: 'cards' };
const navHome: TourStep = { id: 'nav-home', title: 'Még egy hasznos hely', text: 'Még megmutatjuk, hol találod meg újra az útmutatót. Nyisd meg a Kezdőlapot!', target: target('nav-home'), page: 'cards', event: 'navigation', to: 'home' };
const settings: TourStep = { id: 'settings-open', title: 'A beállításaid', text: 'Nyisd meg a beállításokat a fogaskerékkel!', target: target('settings-open'), page: 'home', event: 'navigation', to: 'settings' };
const reopen: TourStep = { id: 'tutorial-reopen', title: 'Bármikor segítünk', text: 'Innen bármikor folytathatod vagy újrakezdheted a bemutatót, és külön fejezeteket is választhatsz.', target: target('tutorial-reopen'), page: 'settings' };

export const TOURS: Record<TourId, { title: string; description: string; duration: string; steps: TourStep[] }> = {
	basics: { title: 'Első lépések', description: 'Ismerd meg a Leardy fő részeit!', duration: 'Kb. 3 perc', steps: [home, navLearning, scope, subject, level, lesson, section, quiz, navClassroom, rooms, navCards, cards, navHome, settings, reopen] },
	learning: { title: 'Tanulás', description: 'Tananyagválasztás, keresés, leckék és kvízek.', duration: 'Kb. 2 perc', steps: [scope, subject, level,
		{ id: 'learning-search', title: 'Találd meg gyorsan!', text: 'A kereső a kiválasztott tananyag leckéi és témakörei között keres.', target: target('learning-search'), page: 'learning' },
		{ id: 'learning-filters', title: 'Szűrés és rendezés', text: 'Itt rendezheted a listát, és szűrhetsz a teljesített vagy még előtted álló leckékre.', target: target('learning-filters'), page: 'learning' },
		{ id: 'learning-continue', title: 'Folytasd, ahol abbahagytad!', text: 'A lejátszás ikonnal visszatérhetsz az utoljára megnyitott leckédhez.', target: target('learning-continue'), page: 'learning', optional: true },
		lesson, section,
		{ id: 'section-quiz', title: 'Egy rész is elég', text: 'A rész melletti dobókockával csak annak a kérdéseit gyakorolhatod.', target: target('section-quiz'), page: 'lesson', optional: true }, quiz] },
	classroom: { title: 'Tanterem', description: 'Csatlakozás, osztályok, feladatok és határidők.', duration: 'Kb. 1 perc', steps: [rooms,
		{ id: 'classroom-add', title: 'Csatlakozás az osztályodhoz', text: 'Nyisd meg a + gombot! Megmutatjuk, hol adhatsz meg csatlakozási kódot.', target: target('classroom-add'), page: 'classroom', event: 'classroom-add' },
		{ id: 'classroom-join', title: 'Csatlakozás kóddal', text: 'Válaszd a Csatlakozás kóddal lehetőséget!', target: target('classroom-join'), page: 'classroom', event: 'classroom-join' },
		{ id: 'classroom-code', title: 'A tanárodtól kapott kód', text: 'Ide írhatod az osztályod kódját. Most nem kell kitöltened vagy elküldened.', target: target('classroom-code'), page: 'classroom' },
		{ id: 'room-open', title: 'Nézz be az osztályodba!', text: 'Nyisd meg a kiemelt osztályt!', target: target('room-link'), page: 'classroom', event: 'navigation', to: 'room', optional: true },
		{ id: 'room-feed', title: 'Feladatok és bejegyzések', text: 'Itt találod a tanárod bejegyzéseit és feladatait. Figyeld a határidőket és a beküldött feladatok értékelését!', target: target('room-feed'), page: 'room', optional: true }] },
	cards: { title: 'Kártyák', description: 'Csomagok felfedezése, mentése és gyakorlása.', duration: 'Kb. 1 perc', steps: [cards,
		{ id: 'cards-add', title: 'Keress új csomagokat!', text: 'Nyisd meg a + gombot!', target: target('cards-add'), page: 'cards', event: 'cards-add' },
		{ id: 'cards-discover', title: 'Felfedezés', text: 'A Felfedezés alatt a hivatalos csomagokat böngészheted. Nyisd meg!', target: target('cards-discover'), page: 'cards', event: 'navigation', to: 'discovery' },
		{ id: 'discovery-overview', title: 'Válassz a csomagok közül!', text: 'Itt kereshetsz és böngészhetsz a hivatalos kártyacsomagok között.', target: target('discovery-overview'), page: 'discovery' },
		{ id: 'package-open', title: 'Nézz meg egy csomagot!', text: 'Nyisd meg a kiemelt kártyacsomagot!', target: target('package-link'), page: 'discovery', event: 'navigation', to: 'package', optional: true },
		{ id: 'package-save', title: 'A saját gyűjteményed', text: 'A + gombbal menthetsz egy csomagot a gyűjteményedbe. A már mentett csomagnál az eltávolítás ikonja látszik. Most egyikre sem kell kattintanod.', target: target('package-save'), page: 'package', optional: true },
		{ id: 'package-practice', title: 'Gyakorlás a saját tempódban', text: 'Ezzel a gombbal indíthatsz gyakorlást. Szókártyáknál a Tudom és Nem tudom válaszok alapján ütemezzük az ismétlést. Most csak a gomb helyét mutatjuk meg.', target: target('package-practice'), page: 'package', optional: true }] }
};

export type TourPath = '/' | '/tanulas' | '/tanterem' | '/kartyak' | '/kartyak/felfedezes' | '/beallitasok' | `/tanulas/lecke/${string}` | `/tanterem/${string}` | `/kartyak/${string}`;
export function tourPath(page: TourStep['page'], context: TourContext): TourPath | null {
	switch (page) {
		case 'home': return '/';
		case 'learning': return '/tanulas';
		case 'lesson': return context.lessonId ? `/tanulas/lecke/${encodeURIComponent(context.lessonId)}` : null;
		case 'classroom': return '/tanterem';
		case 'room': return context.roomId ? `/tanterem/${encodeURIComponent(context.roomId)}` : null;
		case 'cards': return '/kartyak';
		case 'discovery': return '/kartyak/felfedezes';
		case 'package': return context.packageId ? `/kartyak/${encodeURIComponent(context.packageId)}` : null;
		case 'settings': return '/beallitasok';
	}
}

export function parseTourMutation(value: unknown): TourMutation | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (!TOUR_IDS.includes(v.tourId as TourId) || v.version !== TUTORIAL_VERSION) return null;
	if (!['active', 'paused', 'skipped', 'completed'].includes(String(v.status))) return null;
	if (typeof v.stepId !== 'string' || !TOURS[v.tourId as TourId].steps.some((s) => s.id === v.stepId)) return null;
	if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0) return null;
	if (typeof v.operationId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(v.operationId)) return null;
	if (!v.context || typeof v.context !== 'object' || Array.isArray(v.context)) return null;
	const context: TourContext = {};
	for (const key of ['subjectId', 'levelId', 'levelLabel', 'lessonId', 'roomId', 'packageId'] as const) {
		const part = (v.context as Record<string, unknown>)[key];
		if (part === undefined) continue;
		if (typeof part !== 'string' || part.length > 200 || /[\u0000-\u001f]/.test(part)) return null;
		context[key] = part;
	}
	return { tourId: v.tourId as TourId, version: TUTORIAL_VERSION, status: v.status as TourStatus, stepId: v.stepId, context, revision: Number(v.revision), operationId: v.operationId, restart: v.restart === true };
}

/** Régebbi verzió mentése is megőrzi az egyszeri felajánlás döntését. */
export function parseTourRecord(value: unknown): TourRecord | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (!TOUR_IDS.includes(v.tourId as TourId) || !Number.isSafeInteger(v.version) || Number(v.version) < 1) return null;
	if (typeof v.stepId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(v.stepId) || !Number.isFinite(v.updatedAt) || Number(v.updatedAt) < 0) return null;
	const parsed = parseTourMutation({ ...v, version: TUTORIAL_VERSION, stepId: TOURS[v.tourId as TourId].steps[0].id });
	if (!parsed) return null;
	return { tourId: parsed.tourId, version: Number(v.version), status: parsed.status, stepId: v.stepId, context: parsed.context, revision: parsed.revision, operationId: parsed.operationId, updatedAt: Number(v.updatedAt) };
}
