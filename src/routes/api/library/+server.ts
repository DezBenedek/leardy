import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import {
	getOfficialCardPack,
	getOfficialCardPackById,
	getUserDeckPackage,
	listOfficialCardPacksByIds,
	listUserDecks
} from '$lib/server/curriculum';

/* Könyvtár: a saját kártyacsomagok (automatikusan) + a Felfedezésben elmentett
   hivatalos kártyacsomagok. A tananyagi kvízek nem részei a Kártyák területnek:
   a kvíz a lecke oldalán él.
   GET → { packages }, GET?ids=1 → { ids },
   POST { quizId: 'deck:...' | 'pack:...' | 'cards:...' } → ellenőrzés + mentés,
   DELETE { quizId } → mentett hivatalos csomag törlése a könyvtárból.
   Személyes adat: HTTP-gyorstárba nem kerül (no-store); az offline elérést
   a kliens perzisztált gyorstára + a service worker fedi. */

const NOSTORE = { 'cache-control': 'private, no-store' };

export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	try {
		const user = await requireUser(event, db);
		if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
		// Nincs ensure: a sémát a migrációk biztosítják.
		// D1-optimalizálás: a saját csomagok és a mentett id-k párhuzamosan jönnek.
		const [mine, savedRes] = await Promise.all([
			listUserDecks(db, user.id),
			db
				.prepare(`SELECT quiz_id AS quizId FROM library WHERE user_id = ? LIMIT 500`)
				.bind(user.id)
				.all<{ quizId: string }>()
		]);
		const saved = new Set(
			(savedRes.results ?? [])
				.map((r) => r.quizId)
				.filter((id) => id.startsWith('cards:') || id.startsWith('pack:'))
		);
		if (event.url.searchParams.get('ids') === '1') {
			return json({ ids: [...mine.map((p) => p.quizId), ...saved] }, { headers: NOSTORE });
		}
		// D1-optimalizálás: csak a mentett csomagok jönnek le
		// (eddig az ÖSSZES hivatalos csomag + kártya lejött, és JS-ben szűrtünk).
		const packIds = [...saved]
			.filter((id) => id.startsWith('pack:'))
			.map((id) => id.slice('pack:'.length));
		const legacyLessonIds = [...saved]
			.filter((id) => id.startsWith('cards:'))
			.map((id) => id.slice('cards:'.length));
		const [byIds, legacy] = await Promise.all([
			listOfficialCardPacksByIds(db, packIds),
			Promise.all(legacyLessonIds.map((lessonId) => getOfficialCardPack(db, lessonId)))
		]);
		const official = [...byIds, ...legacy.flatMap((p) => (p ? [p] : []))];
		return json({ packages: [...mine, ...official] }, { headers: NOSTORE });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni a könyvtárat.' },
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	try {
		const user = await requireUser(event, db);
		if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
		const body = await event.request.json().catch(() => ({}));
		const quizId = typeof body.quizId === 'string' ? body.quizId : '';
		if (!quizId) return json({ error: 'Hiányzik a csomag.' }, { status: 400 });
		// Nincs ensure: a sémát a migrációk biztosítják.
		if (quizId.startsWith('deck:')) {
			const pkg = await getUserDeckPackage(db, user.id, quizId.slice('deck:'.length));
			if (!pkg) return json({ error: 'Nem található.' }, { status: 404 });
			return json({ ok: true, owned: true });
		}
		if (quizId.startsWith('pack:')) {
			const pack = await getOfficialCardPackById(db, quizId.slice('pack:'.length));
			if (!pack) return json({ error: 'Nem található.' }, { status: 404 });
			await db
				.prepare(`INSERT OR IGNORE INTO library (user_id, quiz_id, added_at) VALUES (?, ?, ?)`)
				.bind(user.id, quizId, Math.floor(Date.now() / 1000))
				.run();
			return json({ ok: true });
		}
		if (quizId.startsWith('cards:')) {
			const pack = await getOfficialCardPack(db, quizId.slice('cards:'.length));
			if (!pack) return json({ error: 'Nem található.' }, { status: 404 });
			await db
				.prepare(`INSERT OR IGNORE INTO library (user_id, quiz_id, added_at) VALUES (?, ?, ?)`)
				.bind(user.id, quizId, Math.floor(Date.now() / 1000))
				.run();
			return json({ ok: true });
		}
		return json({ error: 'Kvízeket már nem lehet a könyvtárba menteni.' }, { status: 400 });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Nem sikerült menteni.' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	try {
		const user = await requireUser(event, db);
		if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
		const body = await event.request.json().catch(() => ({}));
		const quizId = typeof body.quizId === 'string' ? body.quizId : '';
		if (!quizId) return json({ error: 'Hiányzik a csomag.' }, { status: 400 });
		if (quizId.startsWith('deck:'))
			return json({ error: 'Saját csomagot a szerkesztőben törölhetsz.' }, { status: 400 });
		// Nincs ensure: a sémát a migrációk biztosítják.
		await db
			.prepare(`DELETE FROM library WHERE user_id = ? AND quiz_id = ?`)
			.bind(user.id, quizId)
			.run();
		return json({ ok: true });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Nem sikerült törölni.' }, { status: 500 });
	}
};
