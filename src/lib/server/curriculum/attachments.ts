import type { D1Database } from '@cloudflare/workers-types';

/** Saját csomag csatolásainak cseréje: kapcsoló újraírva, régi oszlop az elsőre áll. */
export async function setDeckLessons(
	db: D1Database,
	deckId: string,
	lessonIds: string[]
): Promise<void> {
	const uniq = [...new Set(lessonIds.map((s) => s.trim()).filter(Boolean))].slice(0, 50);
	try {
		await db.prepare(`DELETE FROM deck_lessons WHERE deck_id = ?`).bind(deckId).run();
	} catch {
		// kapcsoló még nincs
	}
	if (uniq.length > 0) {
		try {
			await db.batch(
				uniq.map((lid) =>
					db
						.prepare(`INSERT OR IGNORE INTO deck_lessons (deck_id, lesson_id) VALUES (?, ?)`)
						.bind(deckId, lid)
				)
			);
		} catch {
			// egyedi írásokkal próbálkozunk
			for (const lid of uniq) {
				try {
					await db
						.prepare(`INSERT OR IGNORE INTO deck_lessons (deck_id, lesson_id) VALUES (?, ?)`)
						.bind(deckId, lid)
						.run();
				} catch {
					// egy hibás csatolás nem blokkol
				}
			}
		}
	}
	try {
		await db.prepare(`UPDATE decks SET lesson_id = ? WHERE id = ?`).bind(uniq[0] ?? null, deckId).run();
	} catch {
		// régi oszlop nélkül is jó a kapcsoló
	}
}

/** Hivatalos csomag csatolásainak cseréje (admin/seed rétegnek). */
export async function setPackLessons(
	db: D1Database,
	packId: string,
	lessonIds: string[]
): Promise<void> {
	const uniq = [...new Set(lessonIds.map((s) => s.trim()).filter(Boolean))].slice(0, 50);
	try {
		await db.prepare(`DELETE FROM lesson_card_pack_lessons WHERE pack_id = ?`).bind(packId).run();
	} catch {
		// kapcsoló még nincs
	}
	if (uniq.length > 0) {
		try {
			await db.batch(
				uniq.map((lid) =>
					db
						.prepare(
							`INSERT OR IGNORE INTO lesson_card_pack_lessons (pack_id, lesson_id) VALUES (?, ?)`
						)
						.bind(packId, lid)
				)
			);
		} catch {
			for (const lid of uniq) {
				try {
					await db
						.prepare(
							`INSERT OR IGNORE INTO lesson_card_pack_lessons (pack_id, lesson_id) VALUES (?, ?)`
						)
						.bind(packId, lid)
						.run();
				} catch {
					// egy hibás csatolás nem blokkol
				}
			}
		}
	}
	// Az elsődleges lecke marad a régi oszlopban, hogy a JOIN-ok működjenek.
	try {
		if (uniq.length > 0) {
			await db.prepare(`UPDATE lesson_card_packs SET lesson_id = ? WHERE id = ?`).bind(uniq[0], packId).run();
		}
	} catch {
		// régi oszlop nélkül is jó a kapcsoló
	}
}
