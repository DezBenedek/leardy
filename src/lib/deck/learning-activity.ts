/** A tanulási napok minden eszközön budapesti idő szerint váltanak. */
const dayFormat = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit'
});

export function learningDay(timestamp = Date.now()): string {
	return dayFormat.format(new Date(timestamp));
}

export function shiftDay(day: string, offset: number): string {
	const date = new Date(`${day}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + offset);
	return date.toISOString().slice(0, 10);
}

export function summarizeActivity(days: Iterable<string>, timestamp = Date.now()) {
	const today = learningDay(timestamp);
	const active = new Set([...days].filter((day) => day <= today));
	const todayActive = active.has(today);
	let cursor = todayActive ? today : shiftDay(today, -1);
	let streak = 0;
	while (active.has(cursor)) {
		streak++;
		cursor = shiftDay(cursor, -1);
	}
	const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
	const monday = shiftDay(today, -(weekday === 0 ? 6 : weekday - 1));
	return {
		streak,
		today,
		todayActive,
		week: Array.from({ length: 7 }, (_, index) => {
			const date = shiftDay(monday, index);
			return { date, active: active.has(date) };
		})
	};
}

export function relativeDeadline(timestamp: number, now = Date.now()): string {
	const today = learningDay(now);
	const due = learningDay(timestamp);
	const time = new Intl.DateTimeFormat('hu-HU', {
		timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'
	}).format(new Date(timestamp));
	const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
	if (timestamp < now) return days === 0 ? `Lejárt ma, ${time}` : days === -1 ? 'Tegnap lejárt' : `${Math.abs(days)} napja lejárt`;
	if (days === 0) return `Ma, ${time}`;
	if (days === 1) return `Holnap, ${time}`;
	return `${days} nap múlva`;
}
