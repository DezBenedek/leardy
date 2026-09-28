/* Központi értesítés-store (sonner-szerű): felülről beúszó, hangulat-színezett toastok.
   Használat: toast.success('Mentve'); toast.error('Sikertelen belépés', 'Hibás e-mail vagy jelszó'); */

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
	id: number;
	tone: ToastTone;
	title: string;
	message?: string;
	leaving?: boolean;
}

const MAX_STACK = 3;
const DEFAULT_MS = 4500;
// Ennyi ido alatt halvanyul el a kartya, csak utana toroljuk a listabol.
const LEAVE_MS = 220;

class ToastStore {
	items = $state<ToastItem[]>([]);
	private seq = 1;

	show(tone: ToastTone, title: string, message?: string, ms = DEFAULT_MS): number {
		const id = this.seq++;
		this.items = [...this.items.slice(-(MAX_STACK - 1)), { id, tone, title, message }];
		if (ms > 0) setTimeout(() => this.dismiss(id), ms);
		return id;
	}

	success(title: string, message?: string, ms?: number): number {
		return this.show('success', title, message, ms);
	}

	error(title: string, message?: string, ms?: number): number {
		return this.show('error', title, message, ms);
	}

	info(title: string, message?: string, ms?: number): number {
		return this.show('info', title, message, ms);
	}

	warning(title: string, message?: string, ms?: number): number {
		return this.show('warning', title, message, ms);
	}

	dismiss(id: number): void {
		const item = this.items.find((t) => t.id === id);
		if (!item || item.leaving) return;
		item.leaving = true;
		setTimeout(() => {
			this.items = this.items.filter((t) => t.id !== id);
		}, LEAVE_MS);
	}

	clear(): void {
		this.items = [];
	}
}

export const toast = new ToastStore();
