import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { getDb, getSessionUser } from '$lib/server/db';
import {
	countQuizzesByLesson,
	countQuizzesBySubject,
	getSubjectTree,
	listSubjects
} from '$lib/server/curriculum';

/** Bejelentkezett user id-je, vagy null a done-jelölésekhez. */
async function userIdOf(event: RequestEvent): Promise<string | number | null> {
	try {
		const db = getDb(event);
		if (!db) return null;
		const user = await getSessionUser(event, db);
		return user?.id ?? null;
	} catch {
		return null;
	}
}

/**
 * Böngésző-végpont a Tanulás oldalnak.
 * ?subject= nélkül: tantárgy-lista; ?subject=id esetén a tantárgy fája
 * (?level=id-tel a szintekre szűrve).
 * ?quizcounts=1 esetén kvízszámok is jönnek: tantárgy-listánál
 * quizCountsBySubject, fánál quizCounts (leckénként).
 *
 * Gyorstár: a tananyag ritkán változik, ezért a nyilvános válaszok
 * böngésző-gyorstárba kerülnek (max-age + stale-while-revalidate).
 * A bejelentkezett fa done-jelöléseket tartalmaz, az privát.
 */
const PUBLIC_LIST = 'public, max-age=300, stale-while-revalidate=3600';
const PUBLIC_TREE = 'public, max-age=120, stale-while-revalidate=600';
const PRIVATE_TREE = 'private, max-age=60, stale-while-revalidate=300';
export const GET: RequestHandler = async (event) => {	const subjectId = event.url.searchParams.get('subject') ?? '';
	const levelId = event.url.searchParams.get('level') ?? '';
	const withCounts = event.url.searchParams.get('quizcounts') === '1';
	try {
		if (!subjectId) {
			const subjects = await listSubjects(event);
			if (!withCounts) return json({ subjects }, { headers: { 'cache-control': PUBLIC_LIST } });
			const db = getDb(event);
			const quizCountsBySubject = db ? await countQuizzesBySubject(db) : {};
			return json({ subjects, quizCountsBySubject }, { headers: { 'cache-control': PUBLIC_LIST } });
		}
		const userId = await userIdOf(event);
		const tree = await getSubjectTree(event, subjectId, userId);
		if (!tree) return json({ error: 'Nincs ilyen tantárgy.' }, { status: 404 });
		if (levelId) tree.levels = tree.levels.filter((l) => l.id === levelId);
		const headers: Record<string, string> =
			userId === null
				? { 'cache-control': PUBLIC_TREE }
				: { 'cache-control': PRIVATE_TREE, vary: 'Cookie' };
		if (!withCounts) return json({ tree }, { headers });
		const db = getDb(event);
		const quizCounts = db ? await countQuizzesByLesson(db, subjectId) : {};
		return json({ tree, quizCounts }, { headers });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni a tananyagot.' },
			{ status: 500 }
		);
	}
};
