import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, hashPasswordScrypt } from '$lib/server/db';
import { ensureSecuritySchema } from '$lib/server/classroom';

/* Helyreallitasi kod bevaltasa: { token, code, password }.
 * 10 hibas probalkozas utan a kod ervenytelenedik (brute force ellen).
 * Sikernél a regi sessionok ervenytelenednek, es NEM leptetunk be
 * automatikusan: a felhasznalo a login kepernyon lep be az uj jelszoval. */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureSecuritySchema(db);

	let body: { token?: unknown; code?: unknown; password?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const token = String(body.token ?? '');
	const code = String(body.code ?? '').trim();
	const password = String(body.password ?? '');
	if (!token || code.length !== 6) return json({ error: 'Hibás vagy lejárt kód.' }, { status: 400 });
	if (password.length < 8)
		return json({ error: 'Az új jelszó legalább 8 karakter legyen.' }, { status: 400 });

	const row = await db
		.prepare(
			`SELECT token, user_id, code, expires_at, used_at, attempts FROM password_reset_tokens WHERE token = ?`
		)
		.bind(token)
		.first<{
			token: string;
			user_id: string;
			code: string;
			expires_at: number;
			used_at: number | null;
			attempts: number;
		}>();
	if (!row || row.used_at !== null || row.expires_at < Date.now() || (row.attempts ?? 0) >= 10) {
		if (row && (row.attempts ?? 0) >= 10) {
			await db.prepare(`DELETE FROM password_reset_tokens WHERE token = ?`).bind(row.token).run();
		}
		return json({ error: 'Hibás vagy lejárt kód.' }, { status: 400 });
	}
	if (row.code !== code) {
		const attempts = (row.attempts ?? 0) + 1;
		if (attempts >= 10) {
			await db.prepare(`DELETE FROM password_reset_tokens WHERE token = ?`).bind(row.token).run();
		} else {
			await db
				.prepare(`UPDATE password_reset_tokens SET attempts = ? WHERE token = ?`)
				.bind(attempts, row.token)
				.run();
		}
		return json({ error: 'Hibás vagy lejárt kód.' }, { status: 400 });
	}

	const pass_hash = await hashPasswordScrypt(password);
	const now = Date.now();
	await db.batch([
		db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(pass_hash, row.user_id),
		db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE token = ?').bind(now, row.token),
		db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NOT NULL').bind(row.user_id),
		db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id)
	]);
	return json({ ok: true });
};
