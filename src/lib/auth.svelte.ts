import { browser } from '$app/environment';

export interface User {
	id?: string;
	name: string;
	email: string;
	role?: string;
	xp?: number;
	streak?: number;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DB_DOWN = 'Az adatbázis most nem elérhető. Indítsd újra a dev szervert (`npm run dev`).';

interface ApiUser {
	id: string;
	name: string;
	email: string;
	role?: string;
	xp?: number;
	streak?: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T } | null> {
	try {
		const res = await fetch(path, {
			headers: { 'content-type': 'application/json' },
			...init
		});
		const data = (await res.json().catch(() => ({}))) as T;
		return { status: res.status, data };
	} catch {
		return null; // nincs hálózat / nincs szerver
	}
}

function validateRegister(
	name: string,
	email: string,
	password: string
): { name: string; email: string } | { error: string } {
	const cleanName = name.trim();
	const cleanEmail = email.trim().toLowerCase();
	if (cleanName.length < 2) return { error: 'Add meg a neved.' };
	if (!EMAIL_RE.test(cleanEmail)) return { error: 'Ez nem valós e-mail cím.' };
	if (password.length < 8) return { error: 'A jelszó legalább 8 karakter legyen.' };
	return { name: cleanName, email: cleanEmail };
}

/** Egyszeri takarítás: a régi helyi fallback kulcsai nem kellenek többé (csak D1). */
function clearLegacyLocalAuth(): void {
	if (!browser) return;
	try {
		localStorage.removeItem('leardy-users');
		localStorage.removeItem('leardy-session');
	} catch {
		// nincs mit tenni
	}
}

// ---------- Store (kizárólag D1) ----------

class AuthStore {
	user = $state<User | null>(null);

	constructor() {
		if (browser) {
			clearLegacyLocalAuth();
			void this.refresh();
		}
	}

	/** Induláskor: szerver-session a D1-ből. Nincs helyi fallback. */
	async refresh(): Promise<void> {
		const me = await api<{ user?: ApiUser; error?: string }>('/api/auth/me');
		if (!me) {
			this.user = null;
			return;
		}
		this.user = me.status === 200 && me.data.user ? me.data.user : null;
	}

	async register(name: string, email: string, password: string): Promise<AuthResult> {
		const valid = validateRegister(name, email, password);
		if ('error' in valid) return { ok: false, error: valid.error };

		const res = await api<{ user?: ApiUser; error?: string }>('/api/auth/register', {
			method: 'POST',
			body: JSON.stringify({ name: valid.name, email: valid.email, password })
		});
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300 && res.data.user) {
			this.user = res.data.user;
			return { ok: true };
		}
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	async login(email: string, password: string): Promise<AuthResult> {
		const cleanEmail = email.trim().toLowerCase();
		if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: 'Add meg az e-mail címed.' };
		if (!password) return { ok: false, error: 'Add meg a jelszavad.' };

		const res = await api<{ user?: ApiUser; error?: string }>('/api/auth/login', {
			method: 'POST',
			body: JSON.stringify({ email: cleanEmail, password })
		});
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300 && res.data.user) {
			this.user = res.data.user;
			return { ok: true };
		}
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	async logout(): Promise<void> {
		await api('/api/auth/logout', { method: 'POST' });
		this.user = null;
	}
}

export const auth = new AuthStore();
