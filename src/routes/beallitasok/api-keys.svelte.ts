import { toast } from '$lib/state/toast.svelte';

export interface ApiKeyItem {
	id: string;
	name: string;
	prefix: string;
	createdAt: number;
	lastUsedAt: number | null;
	revoked: boolean;
}

export class ApiKeysStore {
	keys = $state<ApiKeyItem[]>([]);
	loading = $state(false);
	loaded = $state(false);
	name = $state('');
	busy = $state(false);
	newSecret = $state<string | null>(null);
	revokeBusy = $state<string | null>(null);

	constructor(private isTeacher: () => boolean) {}

	async loadApiKeys(force = false) {
		if (!this.isTeacher()) return;
		if (this.loading || (this.loaded && !force)) return;
		this.loading = true;
		try {
			const res = await fetch('/api/api-keys', { credentials: 'same-origin' });
			if (res.ok) {
				const j = await res.json();
				this.keys = Array.isArray(j.keys) ? j.keys : [];
				this.loaded = true;
			}
		} catch {
			// néma hiba: a sor üres marad
		} finally {
			this.loading = false;
		}
	}

	async createApiKey(e?: SubmitEvent) {
		e?.preventDefault();
		if (this.busy || !this.isTeacher()) return;
		this.busy = true;
		try {
			const res = await fetch('/api/api-keys', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ name: this.name.trim() || 'API kulcs' })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült létrehozni', j.error ?? 'Próbáld újra.');
				return;
			}
			this.newSecret = j.secret ?? null;
			this.name = '';
			this.loaded = false;
			await this.loadApiKeys(true);
			toast.success('API kulcs létrehozva', 'Másold ki most, később nem látszik.');
		} catch {
			toast.error('Nem sikerült létrehozni');
		} finally {
			this.busy = false;
		}
	}

	async revokeApiKey(id: string) {
		if (this.revokeBusy) return;
		this.revokeBusy = id;
		try {
			const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE', credentials: 'same-origin' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült visszavonni', j.error ?? 'Próbáld újra.');
				return;
			}
			this.keys = this.keys.filter((k) => k.id !== id);
			toast.success('Kulcs visszavonva');
		} catch {
			toast.error('Nem sikerült visszavonni');
		} finally {
			this.revokeBusy = null;
		}
	}

	async copySecret() {
		if (!this.newSecret) return;
		try {
			await navigator.clipboard.writeText(this.newSecret);
			toast.success('Kimásolva');
		} catch {
			toast.error('Másold ki kézzel a fenti mezőből.');
		}
	}
}
