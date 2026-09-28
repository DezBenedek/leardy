import { browser } from '$app/environment';
import { clearPersistedCache } from './query.svelte';

export interface User {
	id?: string;
	name: string;
	email: string;
	role?: string;
	xp?: number;
	streak?: number;
	is_admin?: number;
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
	is_admin?: number;
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
	/** Igaz, ha a kliens auth-allapot mar szinkronban van (seed/login/logout utan). */
	ready = $state(false);

	constructor() {
		if (browser) clearLegacyLocalAuth();
	}

	/**
	 * Szerver-oldali layout-adat átvétele. A layout az első paint előtt
	 * hívja, minden kliensoldali navigációnál pedig szinkronizál,
	 * ezért induló töltés (splash) nincs.
	 */
	seed(u: User | null): void {
		this.user = u;
		this.ready = true;
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
			this.ready = true;
			// Másik fiók done-jelölései nem szivároghatnak át: gyorstár ürítése.
			clearPersistedCache();
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
			this.ready = true;
			clearPersistedCache();
			return { ok: true };
		}
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	async logout(): Promise<void> {
		await api('/api/auth/logout', { method: 'POST' });
		this.user = null;
		this.ready = true;
		clearPersistedCache();
	}

	/** Tanárrá válás: önkiszolgáló, a szerver állítja a role-t. */
	async becomeTeacher(): Promise<AuthResult> {
		const res = await api<{ user?: ApiUser; error?: string }>('/api/teacher/become', {
			method: 'POST'
		});
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300 && res.data.user) {
			this.user = res.data.user;
			this.ready = true;
			return { ok: true };
		}
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	async updateName(name: string): Promise<AuthResult> {
		const cleanName = name.trim().replace(/\s+/g, ' ');
		if (cleanName.length < 2) return { ok: false, error: 'Add meg a neved.' };
		if (cleanName.length > 80) return { ok: false, error: 'A név legfeljebb 80 karakter lehet.' };

		const res = await api<{ user?: ApiUser; error?: string }>('/api/auth/me', {
			method: 'PATCH',
			body: JSON.stringify({ name: cleanName })
		});
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300 && res.data.user) {
			this.user = res.data.user;
			this.ready = true;
			return { ok: true };
		}
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	async updateEmail(email: string): Promise<AuthResult> {
		const cleanEmail = email.trim().toLowerCase();
		if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: 'Ez nem valós e-mail cím.' };

		const res = await api<{ user?: ApiUser; error?: string }>('/api/auth/me', {
			method: 'PATCH',
			body: JSON.stringify({ email: cleanEmail })
		});
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300 && res.data.user) {
			this.user = res.data.user;
			this.ready = true;
			return { ok: true };
		}
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	async changePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
		if (!currentPassword) return { ok: false, error: 'Add meg a jelenlegi jelszavad.' };
		if (newPassword.length < 8) return { ok: false, error: 'Az új jelszó legalább 8 karakter legyen.' };
		if (currentPassword === newPassword)
			return { ok: false, error: 'Az új jelszó térjen el a régitől.' };

		const res = await api<{ ok?: boolean; error?: string }>('/api/auth/change-password', {
			method: 'POST',
			body: JSON.stringify({ currentPassword, newPassword })
		});
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300) return { ok: true };
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	/** 1. lepes: helyreallitasi kod kerese emailre. Mindig ok, hogy ne lehessen cimeket kitalalni. */
	async requestPasswordReset(email: string): Promise<{ ok: true; token?: string } | { ok: false; error: string }> {
		const cleanEmail = email.trim().toLowerCase();
		if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: 'Add meg a regisztrált e-mail címed.' };

		const res = await api<{ ok?: boolean; token?: string; error?: string }>('/api/auth/reset-password/request', {
			method: 'POST',
			body: JSON.stringify({ email: cleanEmail })
		});
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300) return { ok: true, token: res.data.token };
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	/** 2. lepes: kod bevaltasa uj jelszoval. Sikernel ujra be kell jelentkezni. */
	async confirmPasswordReset(token: string, code: string, newPassword: string): Promise<AuthResult> {
		if (code.trim().length !== 6) return { ok: false, error: 'Add meg a 6 jegyű kódot.' };
		if (newPassword.length < 8) return { ok: false, error: 'Az új jelszó legalább 8 karakter legyen.' };

		const res = await api<{ ok?: boolean; error?: string }>('/api/auth/reset-password/confirm', {
			method: 'POST',
			body: JSON.stringify({ token, code: code.trim(), password: newPassword })
		});
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300) return { ok: true };
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	async deleteAccount(): Promise<AuthResult> {
		const res = await api<{ ok?: boolean; error?: string }>('/api/auth/me', { method: 'DELETE' });
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300) {
			this.user = null;
			this.ready = true;
			return { ok: true };
		}
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	async exportData(): Promise<Record<string, unknown> | null> {
		try {
			const res = await fetch('/api/auth/export');
			if (!res.ok) return null;
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
}

export const auth = new AuthStore();
