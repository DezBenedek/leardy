import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, getSessionUser } from '$lib/server/db';
import {
	getCardProgress,
	getOfficialCardPack,
	getOfficialCardPackById,
	getScopedQuizPackage,
	getUserDeckPackage,
	listDecksForLesson,
	listOfficialCardPacks,
	listOfficialCardPacksForLesson,
	listScopedPackages,
	listUserDecks
} from '$lib/server/curriculum';

/** Csomagok:
 *  ?subject=&level= tananyagi kvízlista (a Tanulás gyors gyakorlásához),
 *  ?scope=cards&subject=&level= hivatalos kártyacsomagok (Felfedezés),
 *  ?attachedTo=<lessonId> a leckéhez csatolt csomagok (hivatalos + saját),
 *  ?id=<quizId|deck:...|pack:...|cards:...> egyetlen adatlap { package, progress } alakban.
 *  Bejelentkezve a saját csomagok elöl jönnek.
 *
 * Gyorstár: a hivatalos csomagok nyilvánosak és ritkán változnak,
 * a saját csomagok és a haladás privát. */
const PUBLIC_PACKS = 'public, max-age=300, stale-while-revalidate=3600';
const PUBLIC_LIST = 'public, max-age=120, stale-while-revalidate=600';
const PRIVATE_SHORT = 'private, max-age=60, stale-while-revalidate=300';
export const GET: RequestHandler = async (event) => {
	const attachedTo = event.url.searchParams.get('attachedTo') || undefined;
	if (attachedTo) {
		try {
			const db = getDb(event);
			if (!db) return json({ packages: [] });
			let user: { id: string | number } | null = null;
			try {
				user = await getSessionUser(event, db).catch(() => null);
			} catch {
				user = null;
			}
			// D1-optimalizálás: a 2 független olvasás párhuzamosan fut.
			const [official, mine] = await Promise.all([
				listOfficialCardPacksForLesson(db, attachedTo).catch(() => []),
				user ? listDecksForLesson(db, user.id, attachedTo).catch(() => []) : Promise.resolve([])
			]);
		return json(
			{ packages: [...official, ...mine] },
			user
				? { headers: { 'cache-control': PRIVATE_SHORT, vary: 'Cookie' } as Record<string, string> }
				: { headers: { 'cache-control': PUBLIC_LIST } }
		);
		} catch {
			return json({ packages: [] });
		}
	}
	const id = event.url.searchParams.get('id') || undefined;
	if (!id) {
		const subjectId = event.url.searchParams.get('subject') || undefined;
		const levelId = event.url.searchParams.get('level') || undefined;
		// Hivatalos kártyacsomagok: a Kártyák Felfedezés forrása.
		if (event.url.searchParams.get('scope') === 'cards') {
			try {
				return json(
					{ packages: await listOfficialCardPacks(event, subjectId, levelId) },
					{ headers: { 'cache-control': PUBLIC_PACKS } }
				);
			} catch (e) {
				return json(
					{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni a csomagokat.' },
					{ status: 500 }
				);
			}
		}
		try {
			const packages = await listScopedPackages(event, subjectId, levelId);
			try {
				const db = getDb(event);
				const user = db ? await getSessionUser(event, db) : null;
				if (user) {
					const mine = await listUserDecks(db ?? event, user.id, subjectId, levelId);
					return json(
						{ packages: [...mine, ...packages] },
						{ headers: { 'cache-control': PRIVATE_SHORT, vary: 'Cookie' } }
					);
				}
			} catch {
				// saját csomagok nélkül is megy
			}
			return json({ packages }, { headers: { 'cache-control': PUBLIC_LIST } });
		} catch (e) {
			return json(
				{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni a csomagokat.' },
				{ status: 500 }
			);
		}
	}
	try {
		const db = getDb(event);
		let user: { id: string | number } | null = null;
		try {
			user = db ? await getSessionUser(event, db) : null;
		} catch {
			user = null;
		}
		let pkg = null;
		if (id.startsWith('deck:')) {
			if (!db || !user) return json({ error: 'Nem található.' }, { status: 404 });
			// D1-optimalizálás: csak az 1 csomag jön le (eddig az összes).
			pkg = await getUserDeckPackage(db, user.id, id.slice('deck:'.length));
		} else if (id.startsWith('pack:')) {
			// Hivatalos kártyacsomag: nyilvános, bejelentkezés nélkül is nyitható.
			pkg = await getOfficialCardPackById(event, id.slice('pack:'.length));
		} else if (id.startsWith('cards:')) {
			// Régi azonosító: a lecke első csomagja.
			pkg = await getOfficialCardPack(event, id.slice('cards:'.length));
		} else {
			// D1-optimalizálás: csak az 1 kvíz jön le (eddig a teljes tananyag).
			pkg = await getScopedQuizPackage(event, id);
		}
		if (!pkg) return json({ error: 'Nem található.' }, { status: 404 });
		const progress = db && user ? await getCardProgress(db, user.id) : {};
		// Vendégként a csomag nyilvános tananyag; bejelentkezve haladás is jár hozzá, az privát.
		return json(
			{ package: pkg, progress },
			user
				? { headers: { 'cache-control': PRIVATE_SHORT, vary: 'Cookie' } as Record<string, string> }
				: { headers: { 'cache-control': PUBLIC_PACKS } }
		);
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni a csomagot.' },
			{ status: 500 }
		);
	}
};
