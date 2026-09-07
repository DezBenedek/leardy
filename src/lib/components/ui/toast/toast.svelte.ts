// Toast-rendszer a régi showAppToast alapján: fent középen sötét pill,
// az üzenet hosszától függő ideig, egyszerre csak egy aktív.
export interface Toast {
	id: number;
	message: string;
}

let nextId = 1;

function durationFor(message: string): number {
	const extra = Math.min(8, Math.max(1, Math.ceil(message.trim().length / 28)));
	return 900 + extra * 450;
}

class ToastStore {
	current = $state<Toast | null>(null);
	private timer: ReturnType<typeof setTimeout> | null = null;

	show(message: string, desc?: string) {
		const full = desc ? `${message} — ${desc}` : message;
		if (this.timer) clearTimeout(this.timer);
		this.current = { id: nextId++, message: full };
		this.timer = setTimeout(() => {
			this.current = null;
			this.timer = null;
		}, durationFor(full));
	}

	/** Kompatibilitás a meglévő hívásokhoz: show(title, desc). */
	legacy(title: string, desc?: string) {
		this.show(title, desc);
	}
}

export const toasts = new ToastStore();
