import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { todayDay } from '$lib/sm2';
import {
	ensureCurriculumSchema,
	getCardProgress,
	listOfficialCardPacks,
	listOfficialCardPacksByIds,
	listUserDecks
} from '$lib/server/curriculum';

/** Egy nyelv összes könyvtári szókártyája egyben az SM-2 gyakorláshoz.
 *  GET ?subject=<subjectId> → { packages, progress, today }.
 *  Csak a saját és a mentett hivatalos csomagok kerülnek bele. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const subjectId = event.url.searchParams.get('subject')?.trim() ?? '';
	if (!subjectId) return json({ error: 'Hiányzik a tantárgy.' }, { status: 400 });
	try {
		try {
			await ensureCurriculumSchema(db);
		} catch {
			// olvasás így is mehet
		}
		const [mine, savedRes, progress] = await Promise.all([
			listUserDecks(db, user.id, subjectId).catch(() => []),
			db
				.prepare(`SELECT quiz_id AS quizId FROM library WHERE user_id = ? LIMIT 500`)
				.bind(user.id)
				.all<{ quizId: string }>()
				.catch(() => ({ results: [] }) as { results: { quizId: string }[] }),
			getCardProgress(db, user.id).catch(() => ({}))
		]);
		const saved = new Set(
			(savedRes.results ?? []).map((r) => r.quizId).filter((id) => id.startsWith('pack:') || id.startsWith('cards:'))
		);
		// Hivatalos csomagok a tantárgyra, csak a mentettek maradnak.
		const officialAll = await listOfficialCardPacks(db, subjectId).catch(() => []);
		const officialSavedIds = new Set(
			officialAll.filter((p) => saved.has(p.quizId)).map((p) => p.quizId)
		);
		// Régi cards: azonosítók is mentve lehetnek, azokat külön kérjük le.
		const legacyIds = [...saved].filter((id) => id.startsWith('cards:'));
		const packIds = [...saved]
			.filter((id) => id.startsWith('pack:'))
			.map((id) => id.slice(5));
		const byIds = packIds.length > 0 ? await listOfficialCardPacksByIds(db, packIds).catch(() => []) : [];
		const byIdsFiltered = byIds.filter((p) => p.subjectId === subjectId || !p.subjectId);
		const official = [...officialAll.filter((p) => officialSavedIds.has(p.quizId))];
		for (const p of byIdsFiltered) {
			if (!official.some((o) => o.quizId === p.quizId)) official.push(p);
		}
		// Örökölt cards: forma is kellhet, ha a pack lista nem fedte le.
		if (legacyIds.length > 0) {
			const { getOfficialCardPack } = await import('$lib/server/curriculum');
			for (const lid of legacyIds.slice(0, 20)) {
				try {
					const pack = await getOfficialCardPack(db, lid.slice(6));
					if (pack && (pack.subjectId === subjectId || !pack.subjectId) && !official.some((p) => p.quizId === pack.quizId)) official.push(pack);
				} catch {
					// egy hibás csomag nem rontja el az egészet
				}
			}
		}
		const packages = [...mine, ...official].filter((p) => (p.cardKind ?? 'word') !== 'study');
		return json(
			{ packages, progress, today: todayDay() },
			{ headers: { 'cache-control': 'private, no-store' } }
		);
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni.' },
			{ status: 500 }
		);
	}
};
