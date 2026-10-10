import { error, json, type RequestHandler } from '@sveltejs/kit';
import { editorContext, getEditorLesson } from '$lib/server/curriculum-editor';
import { getUploadsBucket } from '$lib/server/uploads';
import { MAX_QUESTION_IMAGE_BYTES, questionImageMime } from '$lib/question-image';

export function uploadLessonImage(prefix: 'quiz-images' | 'lesson-images'): RequestHandler {
return async (event) => {
	if (event.request.headers.get('origin') !== event.url.origin) error(403, 'A kérés forrása érvénytelen.');
	const { db, user } = await editorContext(event);
	const length = Number(event.request.headers.get('content-length'));
	const limit = MAX_QUESTION_IMAGE_BYTES + 65536;
	if (length > limit) error(413, 'A kép legfeljebb 10 MB lehet.');
	if (!event.request.body) error(400, 'Hiányzik a képfájl.');
	const reader = event.request.body.getReader();
	let received = 0;
	let tooLarge = false;
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const chunk = await reader.read();
			if (chunk.done) { controller.close(); return; }
			received += chunk.value.byteLength;
			if (received > limit) {
				tooLarge = true;
				await reader.cancel();
				controller.error(new Error('A kép túl nagy.'));
			} else controller.enqueue(chunk.value);
		},
		cancel: (reason) => reader.cancel(reason)
	});
	const form = await new Response(body, { headers: event.request.headers }).formData().catch(() => null);
	if (tooLarge) error(413, 'A kép legfeljebb 10 MB lehet.');
	if (!form) error(400, 'A feltöltés formátuma érvénytelen.');
	const lessonId = form.get('lessonId');
	if (typeof lessonId !== 'string' || !lessonId) error(400, 'Hiányzik a lecke.');
	await getEditorLesson(db, user, lessonId);
	const file = form.get('file');
	if (!(file instanceof File) || !file.size) error(400, 'Válassz képfájlt.');
	if (file.size > MAX_QUESTION_IMAGE_BYTES) error(413, 'A kép legfeljebb 10 MB lehet.');
	const mime = questionImageMime(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
	if (!mime) error(400, 'JPEG, PNG, WebP, GIF vagy AVIF képet válassz.');
	const bucket = getUploadsBucket(event);
	if (!bucket) error(503, 'A képtár most nem érhető el.');
	const id = crypto.randomUUID();
	try {
		await bucket.put(`${prefix}/${id}`, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
	} catch { error(503, 'A kép feltöltése nem sikerült. Próbáld újra.'); }
	return json({ imageUrl: `/api/${prefix}/${id}` }, { status: 201, headers: { 'cache-control': 'no-store' } });
};

}
