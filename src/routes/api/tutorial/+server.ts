import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { readTutorials, writeTutorial } from '$lib/server/tutorial';
import { parseTourMutation } from '$lib/tutorial/definition';

const headers = { 'cache-control': 'no-store' };
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az útmutató mentése most nem elérhető.' }, { status: 503, headers });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Nincs bejelentkezve.' }, { status: 401, headers });
	try { return json({ states: await readTutorials(db, user.id) }, { headers }); }
	catch { return json({ error: 'Az útmutató állapota most nem érhető el.' }, { status: 503, headers }); }
};
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az útmutató mentése most nem elérhető.' }, { status: 503, headers });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Nincs bejelentkezve.' }, { status: 401, headers });
	if (Number(event.request.headers.get('content-length') ?? 0) > 4096) return json({ error: 'Túl hosszú kérés.' }, { status: 413, headers });
	let raw: unknown;
	try {
		const reader = event.request.body?.getReader();
		if (!reader) return json({ error: 'Hibás kérés.' }, { status: 400, headers });
		const chunks: Uint8Array[] = [];
		let length = 0;
		try {
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				length += chunk.value.byteLength;
				if (length > 4096) { await reader.cancel(); return json({ error: 'Túl hosszú kérés.' }, { status: 413, headers }); }
				chunks.push(chunk.value);
			}
		} finally { reader.releaseLock(); }
		const bytes = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
		raw = JSON.parse(new TextDecoder().decode(bytes));
	} catch { return json({ error: 'Hibás kérés.' }, { status: 400, headers }); }
	const mutation = parseTourMutation(raw);
	if (!mutation) return json({ error: 'Érvénytelen útmutatóállapot.' }, { status: 400, headers });
	try {
		const result = await writeTutorial(db, user.id, mutation);
		return json({ state: result.state }, { status: result.conflict ? 409 : 200, headers });
	} catch { return json({ error: 'Az útmutató mentése most nem sikerült.' }, { status: 503, headers }); }
};
