import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getLessonPage } from '$lib/server/curriculum';
import { lessonSections } from '$lib/lesson-content';

/* Egy lecke bekezdései (szekciói): [{ slug, title }] a kártya-besoroláshoz. */

export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	try {
		const lessonPage = await getLessonPage(event, event.params.id ?? '');
		if (!lessonPage) return json({ error: 'Nincs ilyen lecke.' }, { status: 404 });
		return json({
			sections: lessonSections(lessonPage.lesson).map((s) => ({
				slug: s.slug,
				title: s.title
			}))
		});
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni.' },
			{ status: 500 }
		);
	}
};
