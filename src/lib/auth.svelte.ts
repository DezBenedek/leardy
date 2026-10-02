import { browser } from '$app/environment';
import { clearPersistedCache } from './query.svelte';

export interface User {
	id?: string;
	name: string;
	email: string;
	school_id?: string;
	role?: string;
	xp?: number;
	streak?: number;
	is_admin?: number;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

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

// ---------- Store (kizárólag D1 + Google OAuth) ----------

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

	/** Google belépés indítása: szerver oldali OAuth flow. */
	loginWithGoogle(): void {
		window.location.href = '/api/auth/google';
	}

	async logout(): Promise<void> {
		await api('/api/auth/logout', { method: 'POST' });
		this.user = null;
		this.ready = true;
		clearPersistedCache();
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
