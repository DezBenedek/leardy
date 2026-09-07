// Apró toast-rendszer shadcn-sonner hangulatban, külső függőség nélkül.
export interface Toast {
	id: number;
	title: string;
	desc?: string;
}

let nextId = 1;

class ToastStore {
	items = $state<Toast[]>([]);

	show(title: string, desc?: string, ms = 2600) {
		const id = nextId++;
		this.items.push({ id, title, desc });
		setTimeout(() => this.dismiss(id), ms);
	}

	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export const toasts = new ToastStore();
