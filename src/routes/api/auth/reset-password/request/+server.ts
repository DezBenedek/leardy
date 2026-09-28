import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, randomToken } from '$lib/server/db';
import { ensureSecuritySchema } from '$lib/server/classroom';
import { missingSesConfig, resetCodeEmail, sendSesEmail, type SesEnv } from '$lib/server/ses';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_PER_HOUR = 5;

/* Helyreallitasi kod kerese: mindig { ok: true }, hogy ne lehessen
 * e-mail cimeket enumeralni. A kod 15 percig ervenyes, egyszer hasznalhato.
 * A kodot Amazon SES kuldi a leardy@dezso.hu feladorol. */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureSecuritySchema(db);

	let body: { email?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const email = String(body.email ?? '').trim().toLowerCase();
	if (!EMAIL_RE.test(email)) return json({ ok: true });

	const hourAgo = Date.now() - 3600 * 1000;
	const recent = await db
		.prepare(`SELECT COUNT(*) AS n FROM password_reset_tokens WHERE email = ? AND created_at > ?`)
		.bind(email, hourAgo)
		.first<{ n: number }>();
	if ((recent?.n ?? 0) >= MAX_PER_HOUR) return json({ ok: true });
	// Lejart kodok takaritasa (sajat emailhez).
	await db
		.prepare(`DELETE FROM password_reset_tokens WHERE email = ? AND expires_at < ?`)
		.bind(email, Date.now())
		.run()
		.catch(() => {});

	const found = await db
		.prepare(`SELECT id FROM users WHERE email = ?`)
		.bind(email)
		.first<{ id: string }>();
	if (!found) return json({ ok: true });

	const code = String(Math.floor(100000 + Math.random() * 900000));
	const token = randomToken();
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO password_reset_tokens (token, user_id, email, code, created_at, expires_at, used_at, attempts)
			 VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`
		)
		.bind(token, found.id, email, code, now, now + CODE_TTL_MS)
		.run();
	await sendResetCode(event.platform?.env as SesEnv | undefined, email, code);
	// A token-felet visszaadjuk: onmagaban ertektelen, a titok a 6 jegyu kod.
	return json({ ok: true, token });
};

/* SES levelkuldes a helyreallito koddal. Ha nincs SES konfig,
 * csak naplozzuk (fejlesztes), de a folyamat igy is vegigmegy. */
async function sendResetCode(env: SesEnv | undefined, email: string, code: string): Promise<boolean> {
	const missing = missingSesConfig(env ?? {});
	if (missing.length > 0) {
		console.log(`[leardy] SES nincs konfiguralva (${missing.join(', ')}), kod (${email}): ${code}`);
		return false;
	}
	try {
		const { subject, text } = resetCodeEmail(code);
		await sendSesEmail(env as SesEnv, { to: email, subject, text });
		return true;
	} catch (err) {
		console.error('[leardy] SES kuldesi hiba', err);
		return false;
	}
}
