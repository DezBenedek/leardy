import type { D1Database } from '@cloudflare/workers-types';
import type { TourId, TourRecord, TourMutation } from '../tutorial/definition';

interface Row {
	tour_id: TourId; version: number; status: TourRecord['status']; step_id: string;
	context_json: string; revision: number; operation_id: string; updated_at: number;
}
function record(row: Row): TourRecord {
	return { tourId: row.tour_id, version: row.version, status: row.status, stepId: row.step_id, context: JSON.parse(row.context_json), revision: row.revision, operationId: row.operation_id, updatedAt: row.updated_at };
}
export async function readTutorials(db: D1Database, userId: string): Promise<TourRecord[]> {
	const rows = await db.prepare('SELECT * FROM tutorial_progress WHERE user_id = ?').bind(userId).all<Row>();
	return (rows.results ?? []).map(record);
}
export async function writeTutorial(db: D1Database, userId: string, mutation: TourMutation): Promise<{ conflict: boolean; state: TourRecord | null }> {
	const read = async () => {
		const row = await db.prepare('SELECT * FROM tutorial_progress WHERE user_id = ? AND tour_id = ?').bind(userId, mutation.tourId).first<Row>();
		return row ? record(row) : null;
	};
	const current = await read();
	// Az elveszett hálózati válasz után ugyanaz a művelet biztonságosan ismételhető.
	if (current?.operationId === mutation.operationId) return { conflict: false, state: current };
	if ((current?.revision ?? 0) !== mutation.revision) return { conflict: true, state: current };
	if (current && ['completed', 'skipped'].includes(current.status) && mutation.status === 'active' && !mutation.restart) return { conflict: true, state: current };
	const values = [mutation.version, mutation.status, mutation.stepId, JSON.stringify(mutation.context), mutation.operationId, Date.now(), userId, mutation.tourId];
	const result = current
		? await db.prepare('UPDATE tutorial_progress SET version = ?, status = ?, step_id = ?, context_json = ?, operation_id = ?, updated_at = ?, revision = revision + 1 WHERE user_id = ? AND tour_id = ? AND revision = ?').bind(...values, mutation.revision).run()
		: await db.prepare('INSERT INTO tutorial_progress (version, status, step_id, context_json, operation_id, updated_at, user_id, tour_id, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT (user_id, tour_id) DO NOTHING').bind(...values).run();
	return { conflict: result.meta.changes !== 1, state: await read() };
}
