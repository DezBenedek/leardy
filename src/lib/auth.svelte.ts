import { browser } from '$app/environment';

export interface User {
	id?: string;
	name: string;
	email: string;
}

interface StoredUser extends User {
	pass: string; // "salt$sha256hex"
}

export type AuthResult = { ok: true } | { ok: false; error: string };

const USERS_KEY = 'leardy-users';
const SESSION_KEY = 'leardy-session';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- Szerver (D1) ----------

interface ApiUser {
	id: string;
	name: string;
	email: string;
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
		return null; // nincs hálózat / nincs szerver → local fallback
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

// ---------- Helyi fallback (ha a DB nem elérhető) ----------

function readUsers(): StoredUser[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(USERS_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
	} catch {
		return [];
	}
}

function makeSalt(): string {
	try {
		const bytes = crypto.getRandomValues(new Uint8Array(16));
		return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
	} catch {
		return Math.random().toString(36).slice(2) + Date.now().toString(36);
	}
}

async function hashPassword(password: string, salt: string): Promise<string> {
	const input = `${salt}::${password}`;
	try {
		if (typeof crypto !== 'undefined' && crypto.subtle) {
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
			return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
		}
	} catch {
		// leesünk a fallbackre
	}
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < input.length; i++) {
		const c = input.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 16777619);
		h2 = Math.imul(h2 + c, 2246822519);
	}
	return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

async function localRegister(name: string, email: string, password: string): Promise<AuthResult> {
	const users = readUsers();
	if (users.some((u) => u.email === email)) {
		return { ok: false, error: 'Ezzel az e-mail címmel már regisztráltak.' };
	}
	const salt = makeSalt();
	const hash = await hashPassword(password, salt);
	users.push({ name, email, pass: `${salt}$${hash}` });
	try {
		localStorage.setItem(USERS_KEY, JSON.stringify(users));
		localStorage.setItem(SESSION_KEY, email);
	} catch {
		return { ok: false, error: 'A böngésződ nem engedi a mentést.' };
	}
	return { ok: true };
}

async function localLogin(email: string, password: string): Promise<AuthResult> {
	const found = readUsers().find((u) => u.email === email);
	if (!found) return { ok: false, error: 'Nincs fiók ezzel az e-mail címmel.' };
	const [salt, expected] = found.pass.split('$');
	const hash = await hashPassword(password, salt ?? '');
	if (hash !== expected) return { ok: false, error: 'Hibás jelszó. Próbáld újra!' };
	try {
		localStorage.setItem(SESSION_KEY, email);
	} catch {
		// mentés nélkül is belépünk
	}
	return { ok: true };
}

function localSessionUser(): User | null {
	try {
		const email = localStorage.getItem(SESSION_KEY);
		if (!email) return null;
		const found = readUsers().find((u) => u.email === email);
		return found ? { name: found.name, email: found.email } : null;
	} catch {
		return null;
	}
}

// ---------- Store ----------

class AuthStore {
	user = $state<User | null>(null);

	constructor() {
		if (browser) void this.refresh();
	}

	/** Induláskor: szerver-session, ha nincs DB → helyi session. */
	async refresh(): Promise<void> {
		const me = await api<{ user?: ApiUser; error?: string }>('/api/auth/me');
		if (me && me.status !== 503) {
			this.user = me.status === 200 && me.data.user ? me.data.user : null;
			return;
		}
		this.user = localSessionUser();
	}

	async register(name: string, email: string, password: string): Promise<AuthResult> {
		const valid = validateRegister(name, email, password);
		if ('error' in valid) return { ok: false, error: valid.error };

		const res = await api<{ user?: ApiUser; error?: string }>('/api/auth/register', {
			method: 'POST',
			body: JSON.stringify({ name: valid.name, email: valid.email, password })
		});
		if (res && res.status !== 503) {
			if (res.status < 300 && res.data.user) {
				this.user = res.data.user;
				return { ok: true };
			}
			return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
		}
		const local = await localRegister(valid.name, valid.email, password);
		if (local.ok) this.user = localSessionUser();
		return local;
	}

	async login(email: string, password: string): Promise<AuthResult> {
		const cleanEmail = email.trim().toLowerCase();
		if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: 'Add meg az e-mail címed.' };
		if (!password) return { ok: false, error: 'Add meg a jelszavad.' };

		const res = await api<{ user?: ApiUser; error?: string }>('/api/auth/login', {
			method: 'POST',
			body: JSON.stringify({ email: cleanEmail, password })
		});
		if (res && res.status !== 503) {
			if (res.status < 300 && res.data.user) {
				this.user = res.data.user;
				return { ok: true };
			}
			return { ok: false, error: res.data.error ?? 'Hiba történt. Próbáld újra!' };
		}
		const local = await localLogin(cleanEmail, password);
		if (local.ok) this.user = localSessionUser();
		return local;
	}

	async logout(): Promise<void> {
		await api('/api/auth/logout', { method: 'POST' });
		try {
			localStorage.removeItem(SESSION_KEY);
		} catch {
			// nincs mit tenni
		}
		this.user = null;
	}
}

export const auth = new AuthStore();
