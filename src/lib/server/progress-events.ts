import type { D1Database } from '@cloudflare/workers-types';
import { error } from '@sveltejs/kit';
import { getLessonPage } from './curriculum';
import { fingerprint } from './content-cache';
import { learningDay } from '$lib/learning-activity';

export interface ProgressEvent {
	eventId: string; userId: string; lessonId: string; quizVersion: string;
	score: number; total: number; occurredAt: number;
}
export type ProgressStatus = 'accepted' | 'superseded' | 'changed' | 'deleted';

/** A nyugta, a haladás és az aktivitási nap egyetlen D1-tranzakció. */
export async function saveProgressEvent(db: D1Database, userId: string, input: ProgressEvent): Promise<ProgressStatus> {
	if (input.userId !== userId) error(403, 'Az eredmény másik fiókhoz tartozik.');
	if (typeof input.eventId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.eventId)
		|| typeof input.lessonId !== 'string' || !input.lessonId || input.lessonId.length > 200
		|| typeof input.quizVersion !== 'string' || !/^[\da-f]{64}$/.test(input.quizVersion)
		|| !Number.isSafeInteger(input.occurredAt) || input.occurredAt <= 0 || input.occurredAt > Date.now() + 300_000
		|| !Number.isSafeInteger(input.score) || !Number.isSafeInteger(input.total) || input.score < 0 || input.total < 1 || input.score > input.total) error(400, 'Érvénytelen kvízeredmény.');
	const existing = await db.prepare('SELECT status, lesson_id, quiz_version, score, total, occurred_at FROM progress_events WHERE user_id=? AND event_id=?')
		.bind(userId, input.eventId).first<{ status: ProgressStatus; lesson_id: string; quiz_version: string; score: number; total: number; occurred_at: number }>();
	if (existing) {
		if (existing.lesson_id !== input.lessonId || existing.quiz_version !== input.quizVersion || existing.score !== input.score || existing.total !== input.total || existing.occurred_at !== input.occurredAt) error(409, 'Ez az eseményazonosító már más eredményhez tartozik.');
		return existing.status;
	}
	const revision = await db.prepare("SELECT revision FROM curriculum_revisions WHERE scope='catalog'").first<{ revision: number }>();
	if (!revision) error(503, 'A tananyag verziója nem ellenőrizhető.');
	const lesson = await getLessonPage(db, input.lessonId);
	const status: ProgressStatus = !lesson ? 'deleted' : await fingerprint(lesson.quizzes) !== input.quizVersion ? 'changed' : 'accepted';
	await db.batch([
		db.prepare(`INSERT OR IGNORE INTO progress_events (user_id,event_id,lesson_id,occurred_at,quiz_version,score,total,status)
			SELECT ?,?,?,?,?,?,?,CASE WHEN ?='accepted' AND EXISTS (SELECT 1 FROM lesson_progress WHERE user_id=? AND lesson_id=? AND event_at>?) THEN 'superseded' ELSE ? END
			WHERE (SELECT revision FROM curriculum_revisions WHERE scope='catalog')=?`)
			.bind(userId, input.eventId, input.lessonId, input.occurredAt, input.quizVersion, input.score, input.total, status, userId, input.lessonId, input.occurredAt, status, revision.revision),
		db.prepare(`INSERT INTO lesson_progress (user_id,lesson_id,done,score,total,updated_at,event_at)
			SELECT user_id,lesson_id,1,score,total,CAST(occurred_at/1000 AS INTEGER),occurred_at FROM progress_events
			WHERE user_id=? AND event_id=? AND status='accepted'
			ON CONFLICT(user_id,lesson_id) DO UPDATE SET done=1,score=excluded.score,total=excluded.total,updated_at=excluded.updated_at,event_at=excluded.event_at
			WHERE excluded.event_at>lesson_progress.event_at`).bind(userId, input.eventId),
		db.prepare(`INSERT OR IGNORE INTO learning_days (user_id,day)
			SELECT user_id,? FROM progress_events WHERE user_id=? AND event_id=? AND status IN ('accepted','superseded')`)
			.bind(learningDay(input.occurredAt), userId, input.eventId)
	]);
	const receipt = await db.prepare('SELECT status FROM progress_events WHERE user_id=? AND event_id=?').bind(userId, input.eventId).first<{ status: ProgressStatus }>();
	if (!receipt) error(503, 'A tananyag közben megváltozott. Próbáld újra!');
	return receipt.status;
}
