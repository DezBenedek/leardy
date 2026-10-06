/* Központi értesítés-store: egyszerre egy toast, felülről beúszó,
   hangulat-színezett. Használat: toast.success('Mentve'); toast.error('Sikertelen belépés', 'Próbáld újra'); */

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
	id: number;
	tone: ToastTone;
	title: string;
	message?: string;
	leaving?: boolean;
}

const DEFAULT_MS = 4500;
// Ennyi idő alatt halványul el a kártya, csak utána töröljük a listából.
const LEAVE_MS = 220;

class ToastStore {
	items = $state<ToastItem[]>([]);
	private seq = 1;
	private hideTimer: ReturnType<typeof setTimeout> | undefined;
	private leaveTimer: ReturnType<typeof setTimeout> | undefined;

	show(tone: ToastTone, title: string, message?: string, ms = DEFAULT_MS): number {
		const last = this.items[this.items.length - 1];
		// Ugyanaz jön gyorsan egymás után: csak az időzítőt indítjuk újra,
		// a kártyához nem nyúlunk, így semmi nem villan vagy ugrik.
		if (last && !last.leaving && last.tone === tone && last.title === title && last.message === message) {
			this.armHide(last.id, ms);
			return last.id;
		}
		clearTimeout(this.hideTimer);
		clearTimeout(this.leaveTimer);
		const id = this.seq++;
		// Egyszerre csak egy: az új toast tartalmat cserél a kártyában,
		// új animáció nélkül (a Toaster nem key-eli a kártyát).
		this.items = [{ id, tone, title, message }];
		this.armHide(id, ms);
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
		clearTimeout(this.hideTimer);
		item.leaving = true;
		clearTimeout(this.leaveTimer);
		this.leaveTimer = setTimeout(() => {
			this.items = this.items.filter((t) => t.id !== id);
		}, LEAVE_MS);
	}

	clear(): void {
		clearTimeout(this.hideTimer);
		clearTimeout(this.leaveTimer);
		this.items = [];
	}

	private armHide(id: number, ms: number): void {
		clearTimeout(this.hideTimer);
		if (ms > 0) this.hideTimer = setTimeout(() => this.dismiss(id), ms);
	}
}

export const toast = new ToastStore();
