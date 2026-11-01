import { gradeSM2, todayDay } from '$lib/deck/sm2';
import { learningDay } from '$lib/deck/learning-activity';
import { resolveDb, type DbOrEvent } from './shared';

/** Kártyánkénti tudásszint SM-2 ütemezéssel: kulcs (kérdés-azonosító) → állapot.
 *  A repetitions, ease, intervalDays és dueDay hajtja a szavak gyakorlását,
 *  a known és seen a régi pöttyök és csíkok miatt marad. */
export interface CardMark {
	known: number;
	seen: number;
	repetitions: number;
	ease: number;
	intervalDays: number;
	dueDay: number;
}

export async function getCardProgress(
	dbOrEvent: DbOrEvent,
	userId: string | number
): Promise<Record<string, CardMark>> {
	const db = resolveDb(dbOrEvent);
	// D1-optimalizálás: felső korlát, hogy egy elfajult haladás-tábla se olvasson korlátlan sort.
	try {
		const res = await db
			.prepare(
				`SELECT card_key AS cardKey, known, seen,
					COALESCE(repetitions, 0) AS repetitions,
					COALESCE(ease, 2.5) AS ease,
					COALESCE(interval_days, 0) AS intervalDays,
					COALESCE(due_day, 0) AS dueDay
				 FROM card_progress WHERE user_id = ? LIMIT 5000`
			)
			.bind(userId)
			.all<{
				cardKey: string;
				known: number;
				seen: number;
				repetitions: number;
				ease: number;
				intervalDays: number;
				dueDay: number;
			}>();
		const map: Record<string, CardMark> = {};
		for (const row of res.results ?? []) {
			map[row.cardKey] = {
				known: row.known ?? 0,
				seen: row.seen ?? 0,
				repetitions: row.repetitions ?? 0,
				ease: row.ease ?? 2.5,
				intervalDays: row.intervalDays ?? 0,
				dueDay: row.dueDay ?? 0
			};
		}
		return map;
	} catch {
		// Régi séma (migráció előtt): SM-2 mezők nélkül, alapértelmezett ütemezéssel.
		try {
			const res = await db
				.prepare(`SELECT card_key AS cardKey, known, seen FROM card_progress WHERE user_id = ? LIMIT 5000`)
				.bind(userId)
				.all<{ cardKey: string; known: number; seen: number }>();
			const map: Record<string, CardMark> = {};
			for (const row of res.results ?? []) {
				map[row.cardKey] = {
					known: row.known ?? 0,
					seen: row.seen ?? 0,
					repetitions: 0,
					ease: 2.5,
					intervalDays: 0,
					dueDay: 0
				};
			}
			return map;
		} catch {
			return {};
		}
	}
}

/** SM-2 osztályzatok mentése helyben frissítve: nincs új sor ismétléskor.
 *  Tudom = quality 4, Nem tudom = quality 1, intervallum napokban, due nap sorszámmal. */
export async function saveCardProgress(
	dbOrEvent: DbOrEvent,
	userId: string | number,
	results: { key: string; known: boolean }[]
): Promise<void> {
	const db = resolveDb(dbOrEvent);
	// Nincs ensure: a sémát a migrációk biztosítják.
	const rows = results.filter((r) => r && typeof r.key === 'string' && r.key);
	if (rows.length === 0) return;
	const trimmed = rows.slice(0, 500);
	const today = todayDay();
	const timestamp = Date.now();
	const now = new Date(timestamp).toISOString();
	// Meglévő állapot egy körben, hogy az SM-2 számítás pontos legyen.
	const keys = [...new Set(trimmed.map((r) => r.key))];
	const current = new Map<string, CardMark>();
	for (let offset = 0; offset < keys.length; offset += 80) {
		const chunk = keys.slice(offset, offset + 80);
		const res = await db
			.prepare(
				`SELECT card_key AS cardKey, known, seen,
					COALESCE(repetitions, 0) AS repetitions,
					COALESCE(ease, 2.5) AS ease,
					COALESCE(interval_days, 0) AS intervalDays,
					COALESCE(due_day, 0) AS dueDay
				 FROM card_progress WHERE user_id = ? AND card_key IN (${chunk.map(() => '?').join(', ')}) LIMIT 500`
			)
			.bind(userId, ...chunk)
			.all<{
				cardKey: string;
				known: number;
				seen: number;
				repetitions: number;
				ease: number;
				intervalDays: number;
				dueDay: number;
			}>();
		for (const row of res.results ?? []) {
			current.set(row.cardKey, {
				known: row.known ?? 0,
				seen: row.seen ?? 0,
				repetitions: row.repetitions ?? 0,
				ease: row.ease ?? 2.5,
				intervalDays: row.intervalDays ?? 0,
				dueDay: row.dueDay ?? 0
			});
		}
	}
	await db.batch([
		...trimmed.map((r) => {
			const next = gradeSM2(current.get(r.key), r.known, today);
			// A láncban többször szereplő kártya is helyesen halmoz: frissítjük a gyorstárat.
			current.set(r.key, next);
			return db
				.prepare(
					`INSERT INTO card_progress (user_id, card_key, known, seen, updated_at, repetitions, ease, interval_days, due_day)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT (user_id, card_key) DO UPDATE SET
						known = excluded.known,
						seen = excluded.seen,
						updated_at = excluded.updated_at,
						repetitions = excluded.repetitions,
						ease = excluded.ease,
						interval_days = excluded.interval_days,
						due_day = excluded.due_day`
				)
				.bind(userId, r.key, next.known, next.seen, now, next.repetitions, next.ease, next.intervalDays, next.dueDay);
		}),
		db.prepare(`INSERT OR IGNORE INTO learning_days (user_id, day) VALUES (?, ?)`)
			.bind(userId, learningDay(timestamp))
	]);
}
