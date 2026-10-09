import { error, json, isHttpError, type RequestHandler } from '@sveltejs/kit';
import { getDb, getSessionUser } from '$lib/server/db';
import { contentResponse, publicContent } from '$lib/server/content-cache';
import {
	getCardProgress, getOfficialCardPack, getOfficialCardPackById, getScopedQuizPackage,
	getUserDeckPackage, listDecksForLesson, listOfficialCardPacks,
	listOfficialCardPacksForLesson, listScopedPackages, listUserDecks
} from '$lib/server/curriculum';

export const GET: RequestHandler = async (event) => {
	try {
		const db = getDb(event);
		if (!db) error(503, 'Az adatbázis most nem elérhető.');
		const user = await getSessionUser(event, db);
		const attached = event.url.searchParams.get('attachedTo') || undefined;
		const id = event.url.searchParams.get('id') || undefined;
		const subject = event.url.searchParams.get('subject') || undefined;
		const level = event.url.searchParams.get('level') || undefined;
		const cards = event.url.searchParams.get('scope') === 'cards';
		if (id) {
			if (id.startsWith('deck:')) {
				if (!user) error(404, 'Nem található.');
				const pkg = await getUserDeckPackage(db, user.id, id.slice(5));
				if (!pkg) error(404, 'Nem található.');
				return contentResponse(event, { package: pkg, progress: await getCardProgress(db, user.id) }, 0, user.id);
			}
			const resource = await publicContent(event, `package:${id}`, null, async () => {
				const pkg = id.startsWith('pack:') ? await getOfficialCardPackById(event, id.slice(5))
					: id.startsWith('cards:') ? await getOfficialCardPack(event, id.slice(6)) : await getScopedQuizPackage(event, id);
				if (!pkg) error(404, 'Nem található.');
				return pkg;
			});
			return contentResponse(event, { package: resource.data, progress: user ? await getCardProgress(db, user.id) : {} }, resource.version, user?.id ?? null);
		}
		const resource = await publicContent(event, `packages:${JSON.stringify([attached, subject, level, cards])}`, null, () =>
			attached ? listOfficialCardPacksForLesson(db, attached)
				: cards ? listOfficialCardPacks(event, subject, level) : listScopedPackages(event, subject, level));
		const mine = user && !cards ? (attached ? await listDecksForLesson(db, user.id, attached) : await listUserDecks(db, user.id, subject, level)) : [];
		return contentResponse(event, { packages: attached ? [...resource.data, ...mine] : [...mine, ...resource.data] }, resource.version, user && !cards ? user.id : null);
	} catch (e) {
		if (isHttpError(e)) throw e;
		return json({ error: 'Nem sikerült betölteni a csomagokat.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};
