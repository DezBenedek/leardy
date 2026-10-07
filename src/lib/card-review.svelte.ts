import { gradeSM2, type SM2Mark } from './sm2';
import { invalidate } from './query.svelte';

/** Közös mentési sor a szavakhoz és a kártyákhoz. A sikertelen adag megmarad. */
export class CardReviewSession {
	progress = $state<Record<string, Partial<SM2Mark>>>({});
	saving = $state(false);
	error = $state(false);
	private pending: { key: string; known: boolean }[] = [];
	private request: Promise<boolean> | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;

	merge(progress: Record<string, Partial<SM2Mark>>) {
		return { ...progress, ...this.progress };
	}

	mark(key: string, known: boolean, current = this.progress[key]) {
		this.progress = { ...this.progress, [key]: gradeSM2(current, known) };
		this.pending.push({ key, known });
		clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.flush(), 600);
	}

	flush(): Promise<boolean> {
		clearTimeout(this.timer);
		if (this.request) return this.request;
		if (this.pending.length === 0) return Promise.resolve(true);
		this.saving = true;
		this.error = false;
		this.request = this.send().finally(() => {
			this.saving = false;
			this.request = undefined;
		});
		return this.request;
	}

	private async send(): Promise<boolean> {
		while (this.pending.length > 0) {
			const marks = this.pending.slice(0, 80);
			try {
				const res = await fetch('/api/card-progress', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ results: marks }),
					keepalive: true
				});
				if (!res.ok) throw new Error('Nem sikerült menteni.');
				this.pending.splice(0, marks.length);
				invalidate('sm2-due');
				invalidate('subject-words:');
				invalidate('package:');
			} catch {
				this.error = true;
				return false;
			}
		}
		return true;
	}
}
