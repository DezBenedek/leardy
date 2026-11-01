export function fmtTime(ts: number): string {
	try {
		return new Date(ts).toLocaleString('hu-HU', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	} catch {
		return '';
	}
}

export function fmtDate(ts: number): string {
	try {
		return new Date(ts).toLocaleString('hu-HU', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	} catch {
		return '';
	}
}

export function fmtDateOnly(ts: number): string {
	try {
		return new Date(ts).toLocaleDateString('hu-HU', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	} catch {
		return '';
	}
}

export function fmtSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function fmtDuration(s: number): string {
	if (!Number.isFinite(s) || s < 0) return '';
	const m = Math.floor(s / 60);
	const sec = Math.round(s % 60);
	return m > 0 ? `${m}p ${sec}mp` : `${sec}mp`;
}

export function toDueInput(ts: number | null): string {
	if (!ts) return '';
	const d = new Date(ts);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function step(value: number, delta: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value + delta));
}
