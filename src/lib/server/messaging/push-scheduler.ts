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

export async function runPushSchedule(db: D1Database, now = Date.now()) {
	await ensurePushDeliverySchema(db);
	const zones = await db.prepare(`SELECT DISTINCT COALESCE(p.time_zone, 'Europe/Budapest') AS time_zone
		FROM push_subscriptions s LEFT JOIN notification_prefs p ON p.user_id = s.user_id
		WHERE COALESCE(p.reminder, 1) = 1`)
		.all<{ time_zone: string }>();
	for (const { time_zone: timeZone } of zones.results ?? []) {
		const { day, time } = reminderClock(now, timeZone);
		// Időpontonként egy emlékeztető: az átállított időpont aznap is működik.
		await db.prepare(`INSERT OR IGNORE INTO push_deliveries
			(endpoint, event_key, kind, payload_json, created_at, expires_at, next_attempt_at)
			SELECT s.endpoint, ? || COALESCE(p.reminder_time, '20:00'), 'reminder',
				json_object('title', 'Ideje gyakorolni',
					'body', 'Ne szakadjon meg a sorozatod, nézz rá a mai leckéidre.',
					'url', '/', 'tag', ? || COALESCE(p.reminder_time, '20:00')), ?, ?, ?
			FROM push_subscriptions s LEFT JOIN notification_prefs p ON p.user_id = s.user_id
			WHERE COALESCE(p.reminder, 1) = 1 AND COALESCE(p.time_zone, 'Europe/Budapest') = ?
				AND COALESCE(p.reminder_time, '20:00') <= ?`)
			.bind(`reminder:${day}@`, `reminder:${day}@`, now, now + 3600_000, now, timeZone, time).run();
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
	console.log(JSON.stringify({ event: 'push-cron', scheduledAt: now, ...result }));
	return result;
}
