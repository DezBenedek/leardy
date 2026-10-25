import { browser } from '$app/environment';
import { untrack } from 'svelte';
import { clearPersistedCache } from './query.svelte';
import { offlineIdentity, rememberIdentity } from './content-client';

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

const DB_DOWN = 'Az adatbázis most nem elérhető. Indítsd újra a fejlesztői szervert (`pnpm dev`).';

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
	seed(u: User | null, options: { offline?: boolean; isEditor?: boolean } = {}): void {
		if (options.offline) {
			const remembered = browser ? offlineIdentity() : null;
			untrack(() => {
				if (!this.ready) this.user = remembered ? { ...remembered, email: remembered.email ?? '' } : u;
			});
			this.ready = true;
			return;
		}
		if (browser) {
			const previous = offlineIdentity()?.id;
			if (previous && previous !== u?.id) clearPersistedCache();
			rememberIdentity(u?.id ? {
				id: u.id, name: u.name, email: u.email, role: u.role, school_id: u.school_id,
				xp: u.xp, streak: u.streak, is_admin: u.is_admin, isEditor: options.isEditor ?? false
			} : null);
		}
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
		rememberIdentity(null);
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
			this.seed(res.data.user, { isEditor: offlineIdentity()?.isEditor });
			return { ok: true };
		}
		return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
	}

	async deleteAccount(): Promise<AuthResult> {
		const res = await api<{ ok?: boolean; error?: string }>('/api/auth/me', { method: 'DELETE' });
		if (!res) return { ok: false, error: DB_DOWN };
		if (res.status < 300) {
			try { if (this.user?.id) localStorage.removeItem('leardy-tutorial:' + this.user.id); } catch { /* A helyi tároló nem elérhető. */ }
			this.user = null;
			this.ready = true;
			clearPersistedCache();
			rememberIdentity(null);
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
