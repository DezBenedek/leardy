import type { D1Database } from '@cloudflare/workers-types';
import { ensurePushDeliverySchema, processPushQueue } from './push';

/** Az időzóna az eszközről szinkronizálódik, a nyári időszámítást az Intl kezeli. */
export function reminderClock(now: number, timeZone: string): { day: string; time: string } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
	}).formatToParts(new Date(now));
	const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	return { day: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
}

/** "HH:MM" érvényesítése, hibás értékre az alapértelmezett idő. */
function clampReminderTime(value: unknown): string {
	return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : '20:00';
}

/** Adott nap és helyi időpont UTC milliszekundummá alakítása a zónában.
 *  Elv: a faliórát először UTC-nek vesszük, majd levonjuk a zóna
 *  ahhoz a pillanathoz tartozó eltolását. Átállás napján közelítő. */
export function zonedTimeToUtc(day: string, time: string, timeZone: string): number {
	const guess = Date.parse(`${day}T${clampReminderTime(time)}:00Z`);
	if (Number.isNaN(guess)) return NaN;
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
	}).formatToParts(new Date(guess));
	const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	const asUtc = Date.parse(
		`${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}Z`
	);
	if (Number.isNaN(asUtc)) return NaN;
	return guess + (guess - asUtc);
}

export async function runPushSchedule(db: D1Database, now = Date.now()) {
	await ensurePushDeliverySchema(db);
	// Időzóna és időpont páronként ütemezünk: a sort már órákkal korábban
	// létrehozzuk a pontos esedékességre, így egy késő vagy kimaradó cron
	// után is időben megy ki az értesítés, duplikáció nélkül.
	const combos = await db.prepare(`SELECT DISTINCT
			COALESCE(p.time_zone, 'Europe/Budapest') AS time_zone,
			COALESCE(p.reminder_time, '20:00') AS reminder_time
		FROM push_subscriptions s LEFT JOIN notification_prefs p ON p.user_id = s.user_id
		WHERE COALESCE(p.reminder, 1) = 1`)
		.all<{ time_zone: string; reminder_time: string }>();
	const groups = new Map<string, { day: string; keys: string[] }>();
	for (const combo of combos.results ?? []) {
		let timeZone = 'Europe/Budapest';
		try {
			new Intl.DateTimeFormat('en-CA', { timeZone: combo.time_zone }).format();
			timeZone = combo.time_zone;
		} catch {
			// Ismeretlen zóna: az alapértelmezettel számolunk.
		}
		const reminderTime = clampReminderTime(combo.reminder_time);
		const { day } = reminderClock(now, timeZone);
		const due = zonedTimeToUtc(day, reminderTime, timeZone);
		if (Number.isNaN(due)) continue;
		// Lejárt, de még ma esedékes: azonnal küldendő (eddigi viselkedés).
		// Több mint egy órája lejárt: már nem zaklatunk vele.
		if (due <= now && now - due > 3600_000) continue;
		const base = Math.max(due, now);
		// Időpontonként egy emlékeztető: az átállított időpont aznap is működik.
		await db.prepare(`INSERT OR IGNORE INTO push_deliveries
			(endpoint, event_key, kind, payload_json, created_at, expires_at, next_attempt_at)
			SELECT s.endpoint, ? || ?, 'reminder',
				json_object('title', 'Ideje gyakorolni',
					'body', 'Ne szakadjon meg a sorozatod, nézz rá a mai leckéidre.',
					'url', '/', 'tag', ? || ?), ?, ?, ?
			FROM push_subscriptions s LEFT JOIN notification_prefs p ON p.user_id = s.user_id
			WHERE COALESCE(p.reminder, 1) = 1 AND COALESCE(p.time_zone, 'Europe/Budapest') = ?
				AND substr('0' || COALESCE(p.reminder_time, '20:00'), -5) = ?`)
			.bind(`reminder:${day}@`, reminderTime, `reminder:${day}@`, reminderTime,
				now, base + 3600_000, due > now ? due : now, timeZone, reminderTime).run();
		const groupKey = `${timeZone}|${day}`;
		let group = groups.get(groupKey);
		if (!group) {
			group = { day, keys: [] as string[] };
			groups.set(groupKey, group);
		}
		group.keys.push(`reminder:${day}@${reminderTime}`);
	}
	// Felülírt időpont: a régi, még ki nem küldött mai sor nem mehet ki.
	// Csoportonként egyszer, hogy a többféle időpont ne törölje egymást.
	for (const { day, keys } of groups.values()) {
		const uniq = [...new Set(keys)];
		await db.prepare(`DELETE FROM push_deliveries
			WHERE kind = 'reminder' AND delivered_at IS NULL AND event_key LIKE ?
			AND event_key NOT IN (${uniq.map(() => '?').join(',')})`)
			.bind(`reminder:${day}@%`, ...uniq).run();
	}
	// Csak a még be nem adott feladatokra jelzünk, a némítást is megtartva.
	for (const kind of ['task', 'assignment'] as const) {
		const table = kind === 'task' ? 'classroom_tasks' : 'classroom_assignments';
		const submissions = kind === 'task' ? 'task_submissions' : 'assignment_submissions';
		const foreignKey = kind === 'task' ? 'task_id' : 'assignment_id';
		await db.prepare(`INSERT OR IGNORE INTO push_deliveries
			(endpoint, event_key, kind, classroom_id, payload_json, created_at, expires_at, next_attempt_at)
			SELECT s.endpoint, 'due:${kind}:' || t.id || ':' || t.due_date, 'due', t.classroom_id,
				json_object('title', 'Határidő közeleg', 'body', t.title || ': 24 órán belül lejár.',
					'url', '/tanterem/' || t.classroom_id, 'tag', 'due:${kind}:' || t.id || ':' || t.due_date), ?, t.due_date, ?
			FROM ${table} t JOIN classroom_members m ON m.classroom_id = t.classroom_id
			JOIN push_subscriptions s ON s.user_id = m.user_id
			LEFT JOIN notification_prefs p ON p.user_id = s.user_id
			WHERE t.due_date > ? AND t.due_date <= ? AND COALESCE(p.due_soon, 1) = 1
			AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(p.muted_json, '[]')) WHERE value = t.classroom_id)
			AND NOT EXISTS (SELECT 1 FROM ${submissions} sub WHERE sub.${foreignKey} = t.id AND sub.user_id = s.user_id AND sub.submitted = 1)`)
			.bind(now, now, now, now + 86400_000).run();
	}
	const result = await processPushQueue(db, now);
	// Üres futásnál nincs log: percenként 1440 sor helyett csak a valódi forgalom látszik.
	if (result.sent > 0 || result.failed > 0) {
		console.log(JSON.stringify({ event: 'push-cron', scheduledAt: now, ...result }));
	}
	return result;
}
