import type { D1Database } from '@cloudflare/workers-types';
import type { CustomTemplate } from '../quiz-editor';

/** A projekt többi saját tárához hasonlóan migráció előtt is létrehozható. */
export async function ensureQuizTemplateSchema(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(`CREATE TABLE IF NOT EXISTS quiz_templates (
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			id TEXT NOT NULL,
			seed_json TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			PRIMARY KEY (user_id, id)
		)`),
		db.prepare('CREATE INDEX IF NOT EXISTS idx_quiz_templates_user_created ON quiz_templates(user_id, created_at DESC, id)')
	]);
}

export async function listQuizTemplates(db: D1Database, userId: string): Promise<CustomTemplate[]> {
	const rows = await db.prepare(`SELECT id, seed_json, created_at FROM quiz_templates
		WHERE user_id = ? ORDER BY created_at DESC, id`).bind(userId)
		.all<{ id: string; seed_json: string; created_at: number }>();
	return rows.results.map((row) => ({ ...JSON.parse(row.seed_json), key: row.id, createdAt: row.created_at }));
}
