import { error, type RequestHandler } from '@sveltejs/kit';
import { getUploadsBucket } from '$lib/server/uploads';
import { QUESTION_IMAGE_TYPES } from '$lib/question-image';

export const GET: RequestHandler = async (event) => {
	if (!/^[a-f0-9-]{36}$/.test(event.params.id ?? '')) error(404, 'Nincs ilyen kép.');
	const bucket = getUploadsBucket(event);
	if (!bucket) error(503, 'A képtár most nem érhető el.');
	const image = await bucket.get(`quiz-images/${event.params.id}`);
	if (!image || !QUESTION_IMAGE_TYPES.includes(image.httpMetadata?.contentType ?? '')) error(404, 'Nincs ilyen kép.');
	const headers = new Headers({ 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
	headers.set('content-type', image.httpMetadata!.contentType!);
	headers.set('etag', image.httpEtag);
	if (event.request.headers.get('if-none-match') === image.httpEtag) {
		await image.body.cancel();
		return new Response(null, { status: 304, headers });
	}
	headers.set('content-length', String(image.size));
	// A platform és a DOM streamtípusai eltérnek, az adatot másolás nélkül továbbítjuk.
	const reader = image.body.getReader();
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const chunk = await reader.read();
			if (chunk.done) controller.close();
			else controller.enqueue(chunk.value);
		},
		cancel: (reason) => reader.cancel(reason)
	});
	return new Response(body, { headers });
};
