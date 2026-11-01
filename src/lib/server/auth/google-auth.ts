/* Google OAuth segéd: csak @szentangela.hu fiók engedett.
   Authorization code flow server oldalon, Cloudflare Workers-kompatibilis fetch-csel.
   A domain szűrés két helyen: a Google beleegyező képernyőn (hd paraméter, csak UI segítség)
   és itt szerver oldalon (email utótag + email_verified, ez a mérvadó). */

export const ALLOWED_DOMAIN = 'szentangela.hu';
export const ALLOWED_DOMAINS: readonly string[] = [ALLOWED_DOMAIN];

/** Iskola azonosító az e-mail domainből: szentangela.hu marad egyben. */
export function schoolIdFromEmail(email: string): string {
	const at = email.trim().toLowerCase().lastIndexOf('@');
	if (at < 0) return '';
	return email.trim().toLowerCase().slice(at + 1);
}

export interface GoogleEnv {
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
}

export interface GoogleProfile {
	sub: string;
	email: string;
	email_verified: boolean;
	name: string;
	given_name?: string;
	family_name?: string;
	picture?: string;
	hd?: string;
}

export function getGoogleEnv(env: GoogleEnv | undefined | null): {
	clientId: string;
	clientSecret: string;
} | null {
	const clientId = env?.GOOGLE_CLIENT_ID?.trim();
	const clientSecret = env?.GOOGLE_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) return null;
	return { clientId, clientSecret };
}

export function isAllowedEmail(email: string): boolean {
	const domain = schoolIdFromEmail(email);
	return (ALLOWED_DOMAINS as readonly string[]).includes(domain);
}

/* Szerepkör az e-mail helyi része alapján:
   csak számokból álló helyi rész (pl. 72000000000) diák,
   minden más (pl. hangositas, kt) tanár. */
export function isStudentEmail(email: string): boolean {
	const clean = email.trim().toLowerCase();
	const at = clean.lastIndexOf('@');
	if (at <= 0) return false;
	const local = clean.slice(0, at);
	return local.length > 0 && /^\d+$/.test(local);
}

/* Automatikus szerepkör: számos cím diák, egyéb tanár. */
export function roleFromEmail(email: string): 'student' | 'teacher' {
	return isStudentEmail(email) ? 'student' : 'teacher';
}

export function buildGoogleAuthUrl(opts: {
	clientId: string;
	redirectUri: string;
	state: string;
}): string {
	const params = new URLSearchParams({
		client_id: opts.clientId,
		redirect_uri: opts.redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		state: opts.state,
		hd: ALLOWED_DOMAIN,
		prompt: 'select_account',
		access_type: 'online'
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function randomState(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface TokenResponse {
	access_token?: string;
	id_token?: string;
	token_type?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
}

/* Kódcsere access tokenre. Hibánál dob. */
export async function exchangeCodeForTokens(opts: {
	code: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}): Promise<string> {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code: opts.code,
			client_id: opts.clientId,
			client_secret: opts.clientSecret,
			redirect_uri: opts.redirectUri,
			grant_type: 'authorization_code'
		}).toString()
	});
	const data = (await res.json().catch(() => ({}))) as TokenResponse;
	if (!res.ok || !data.access_token) {
		throw new Error(data.error_description ?? data.error ?? 'Google token csere sikertelen.');
	}
	return data.access_token;
}

/* Google profil lekérése access tokennel. Hibánál dob. */
export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
	const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
		headers: { authorization: `Bearer ${accessToken}` }
	});
	const data = (await res.json().catch(() => ({}))) as Partial<GoogleProfile>;
	if (!res.ok || !data.email || !data.sub) {
		throw new Error('Google profil lekérése sikertelen.');
	}
	return {
		sub: String(data.sub),
		email: String(data.email).trim().toLowerCase(),
		email_verified: data.email_verified === true,
		name: String(data.name ?? '').trim()
	};
}

/* Profil ellenőrzése: verified email + engedélyezett domain + név fallback. */
export function validateGoogleProfile(p: GoogleProfile): {
	email: string;
	name: string;
	sub: string;
	school_id: string;
} {
	if (!p.email_verified) throw new Error('A Google fiók e-mail címe nincs megerősítve.');
	const email = p.email.trim().toLowerCase();
	const school_id = schoolIdFromEmail(email);
	if (!isAllowedEmail(email)) {
		throw new Error(`Csak @${ALLOWED_DOMAIN} végű Google fiókkal lehet belépni.`);
	}
	const name = p.name.trim().replace(/\s+/g, ' ').slice(0, 80) || email.split('@')[0];
	if (name.length < 2) throw new Error('A Google fiókhoz nem tartozik megjeleníthető név.');
	return { email, name, sub: p.sub, school_id };
}
