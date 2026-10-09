import { error, json, isHttpError, type RequestHandler } from '@sveltejs/kit';
import { getDb, getSessionUser } from '$lib/server/db';
import { countQuizzesByLesson, countQuizzesBySubject, getSubjectTree, listSubjects } from '$lib/server/curriculum';
import { contentResponse, publicContent } from '$lib/server/content-cache';

export const GET: RequestHandler = async (event) => {
	const subjectId = event.url.searchParams.get('subject') ?? '';
	const levelId = event.url.searchParams.get('level') ?? '';
	const counts = event.url.searchParams.get('quizcounts') === '1';
	try {
		const db = getDb(event);
		if (!db) error(503, 'Az adatbázis most nem elérhető.');
		if (!subjectId) {
			const resource = await publicContent(event, `subjects:${counts}`, null, async () => ({
				subjects: await listSubjects(event),
				...(counts ? { quizCountsBySubject: await countQuizzesBySubject(db) } : {})
			}));
			return contentResponse(event, resource.data, resource.version);
		}
		const resource = await publicContent(event, `tree:${subjectId}:${levelId}:${counts}`, subjectId, async () => {
			const tree = await getSubjectTree(event, subjectId, null);
			if (!tree) error(404, 'Nincs ilyen tantárgy.');
			if (levelId) tree.levels = tree.levels.filter((l) => l.id === levelId);
			return { tree, ...(counts ? { quizCounts: await countQuizzesByLesson(db, subjectId) } : {}) };
		});
		const user = await getSessionUser(event, db);
		if (user) {
			const done = await db.prepare(`SELECT p.lesson_id FROM lesson_progress p
				JOIN lessons le ON le.id=p.lesson_id JOIN materials m ON m.id=le.material_id
				JOIN levels l ON l.id=m.level_id WHERE p.user_id=? AND p.done=1 AND l.subject_id=?`)
				.bind(user.id, subjectId).all<{ lesson_id: string }>();
			const ids = new Set(done.results.map((r) => r.lesson_id));
			for (const level of resource.data.tree.levels) for (const material of level.materials) for (const lesson of material.lessons) lesson.done = ids.has(lesson.id);
		}
		return contentResponse(event, resource.data, resource.version, user?.id ?? null);
	} catch (e) {
		if (isHttpError(e)) throw e;
		return json({ error: 'Nem sikerült betölteni a tananyagot.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};
