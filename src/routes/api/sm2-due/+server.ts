import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { ensureCurriculumSchema, getCardProgress } from '$lib/server/curriculum';
import { publishedLevelSql } from '$lib/server/curriculum-publication';
import { isLanguageSubject, todayDay } from '$lib/sm2';

/** SM-2 esedékesség nyelvenként a főoldalhoz.
 *  Csak a könyvtárban lévő csomagok számítanak (saját + mentett hivatalos).
 *  Válasz: { today, languages: [{ subjectId, subjectTitle, due, fresh, total, packs, linkId }] }.
 *  DB takarékos: 5-6 lekérdezés, nincs kártyaszöveg, csak azonosítók és haladás. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	try {
		try {
			await ensureCurriculumSchema(db);
		} catch {
			// séma hiba esetén is próbáljuk az olvasást
		}
		const today = todayDay();
		const progress: Record<string, { seen?: number; repetitions?: number; dueDay?: number }> =
			await getCardProgress(db, user.id).catch(() => ({}));

		// Saját csomagok tantárggyal.
		const decksRes = await db
			.prepare(
				`SELECT d.id AS id, d.subject_id AS subjectId,
					COALESCE(s.title, '') AS subjectTitle,
					COALESCE(s.icon, 'book') AS icon
				 FROM decks d LEFT JOIN subjects s ON s.id = d.subject_id
				 WHERE d.user_id = ? AND (d.kind IS NULL OR d.kind <> 'quiz') LIMIT 500`
			)
			.bind(user.id)
			.all<{ id: string; subjectId: string | null; subjectTitle: string; icon: string }>();
		const decks = decksRes.results ?? [];
		const deckSubject = new Map<string, { subjectId: string; title: string; icon: string }>();
		for (const d of decks) {
			deckSubject.set(d.id, {
				subjectId: d.subjectId ?? '',
				title: d.subjectTitle ?? '',
				icon: d.icon ?? 'book'
			});
		}
		let deckCardIds: { id: string; deck_id: string }[] = [];
		if (decks.length > 0) {
			const res = await db
				.prepare(
					`SELECT id, deck_id FROM deck_cards WHERE deck_id IN (${decks.map(() => '?').join(', ')}) LIMIT 5000`
				)
				.bind(...decks.map((d) => d.id))
				.all<{ id: string; deck_id: string }>();
			deckCardIds = res.results ?? [];
		}

		// Mentett hivatalos csomagok.
		const libRes = await db
			.prepare(`SELECT quiz_id AS quizId FROM library WHERE user_id = ? LIMIT 500`)
			.bind(user.id)
			.all<{ quizId: string }>();
		const saved = (libRes.results ?? []).map((r) => r.quizId).filter(Boolean);
		const packIds = saved.filter((id) => id.startsWith('pack:')).map((id) => id.slice(5));
		const legacyLessonIds = saved.filter((id) => id.startsWith('cards:')).map((id) => id.slice(6));

		const packSubject = new Map<string, { subjectId: string; title: string; icon: string }>();
		let lessonCardIds: { id: string; packId: string | null; lessonId: string }[] = [];
		if (packIds.length > 0) {
			const uniq = [...new Set(packIds)].slice(0, 200);
			const packsRes = await db
				.prepare(
					`SELECT p.id AS packId, s.id AS subjectId, s.title AS subjectTitle,
						COALESCE(s.icon, 'book') AS icon
					 FROM lesson_card_packs p
					 JOIN lessons le ON le.id = p.lesson_id
					 JOIN materials m ON m.id = le.material_id
					 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
					 JOIN subjects s ON s.id = l.subject_id
					 WHERE p.id IN (${uniq.map(() => '?').join(', ')}) LIMIT 200`
				)
				.bind(...uniq)
				.all<{ packId: string; subjectId: string; subjectTitle: string; icon: string }>();
			for (const r of packsRes.results ?? []) {
				packSubject.set(r.packId, {
					subjectId: r.subjectId,
					title: r.subjectTitle ?? '',
					icon: r.icon ?? 'book'
				});
			}
			const cardsRes = await db
				.prepare(
					`SELECT id, pack_id AS packId, lesson_id AS lessonId FROM lesson_cards
					 WHERE pack_id IN (${uniq.map(() => '?').join(', ')}) LIMIT 5000`
				)
				.bind(...uniq)
				.all<{ id: string; packId: string | null; lessonId: string }>();
			lessonCardIds = cardsRes.results ?? [];
		}
		if (legacyLessonIds.length > 0) {
			const uniq = [...new Set(legacyLessonIds)].slice(0, 100);
			const subjRes = await db
				.prepare(
					`SELECT le.id AS lessonId, s.id AS subjectId, s.title AS subjectTitle,
						COALESCE(s.icon, 'book') AS icon
					 FROM lessons le
					 JOIN materials m ON m.id = le.material_id
					 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
					 JOIN subjects s ON s.id = l.subject_id
					 WHERE le.id IN (${uniq.map(() => '?').join(', ')}) LIMIT 100`
				)
				.bind(...uniq)
				.all<{ lessonId: string; subjectId: string; subjectTitle: string; icon: string }>();
			const lessonToSubj = new Map<string, { subjectId: string; title: string; icon: string }>();
			for (const r of subjRes.results ?? []) {
				lessonToSubj.set(r.lessonId, {
					subjectId: r.subjectId,
					title: r.subjectTitle ?? '',
					icon: r.icon ?? 'book'
				});
			}
			const cardsRes = await db
				.prepare(
					`SELECT id, pack_id AS packId, lesson_id AS lessonId FROM lesson_cards
					 WHERE lesson_id IN (${uniq.map(() => '?').join(', ')}) LIMIT 5000`
				)
				.bind(...uniq)
				.all<{ id: string; packId: string | null; lessonId: string }>();
			for (const c of cardsRes.results ?? []) {
				lessonCardIds.push(c);
				// Örökölt csomagnál a lecke tantárgya számít, ha a pack nem ismert.
				if (c.packId && packSubject.has(c.packId)) continue;
				const s = lessonToSubj.get(c.lessonId);
				if (s && c.packId && !packSubject.has(c.packId)) packSubject.set(c.packId ?? c.lessonId, s);
				if (!c.packId && s) packSubject.set(`lesson:${c.lessonId}`, s);
			}
		}

		interface Agg {
			subjectId: string;
			subjectTitle: string;
			due: number;
			fresh: number;
			total: number;
			packs: Set<string>;
			linkId: string;
		}
		const bySubject = new Map<string, Agg>();

		function aggFor(subjectId: string, title: string): Agg {
			let a = bySubject.get(subjectId);
			if (!a) {
				a = { subjectId, subjectTitle: title, due: 0, fresh: 0, total: 0, packs: new Set(), linkId: '' };
				bySubject.set(subjectId, a);
			}
			return a;
		}

		for (const c of deckCardIds) {
			const s = deckSubject.get(c.deck_id);
			if (!s || !s.subjectId) continue;
			if (!isLanguageSubject(s.title, s.icon, s.subjectId)) continue;
			const a = aggFor(s.subjectId, s.title || 'Nyelv');
			a.total += 1;
			if (!a.linkId) a.linkId = `deck:${c.deck_id}`;
			a.packs.add(`deck:${c.deck_id}`);
			const m = progress[c.id] as
				| { seen?: number; repetitions?: number; dueDay?: number }
				| undefined;
			const seen = m?.seen ?? 0;
			const reps = m?.repetitions ?? 0;
			const dueDay = m?.dueDay ?? 0;
			if (seen === 0 && reps === 0) {
				a.due += 1;
				a.fresh += 1;
			} else if (dueDay <= today) {
				a.due += 1;
			}
		}

		const counted = new Set<string>();
		for (const c of lessonCardIds) {
			if (counted.has(c.id)) continue;
			counted.add(c.id);
			const key = c.packId ?? `lesson:${c.lessonId}`;
			const s = packSubject.get(key) ?? packSubject.get(c.packId ?? '');
			if (!s || !s.subjectId) continue;
			if (!isLanguageSubject(s.title, s.icon, s.subjectId)) continue;
			const a = aggFor(s.subjectId, s.title || 'Nyelv');
			a.total += 1;
			const link = c.packId ? `pack:${c.packId}` : `cards:${c.lessonId}`;
			if (!a.linkId) a.linkId = link;
			a.packs.add(link);
			const m = progress[c.id] as
				| { seen?: number; repetitions?: number; dueDay?: number }
				| undefined;
			const seen = m?.seen ?? 0;
			const reps = m?.repetitions ?? 0;
			const dueDay = m?.dueDay ?? 0;
			if (seen === 0 && reps === 0) {
				a.due += 1;
				a.fresh += 1;
			} else if (dueDay <= today) {
				a.due += 1;
			}
		}

		const languages = [...bySubject.values()]
			.filter((a) => a.total > 0)
			.map((a) => ({
				subjectId: a.subjectId,
				subjectTitle: a.subjectTitle,
				due: a.due,
				fresh: a.fresh,
				total: a.total,
				packs: a.packs.size,
				linkId: a.linkId
			}))
			.sort((a, b) => b.due - a.due || b.total - a.total);

		return json(
			{ today, languages },
			{ headers: { 'cache-control': 'private, no-store' } }
		);
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni.' },
			{ status: 500 }
		);
	}
};
