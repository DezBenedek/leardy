import type { D1Database } from '@cloudflare/workers-types';
import { storedQuestionOptions } from '$lib/question-types/registry';

export async function levelIdForMaterial(db: D1Database, materialId: string): Promise<string | null> {
	const row = await db
		.prepare(`SELECT level_id AS levelId FROM materials WHERE id = ?`)
		.bind(materialId)
		.first<{ levelId: string }>()
		.catch(() => null);
	return row?.levelId ?? null;
}

export async function levelIdForLesson(db: D1Database, lessonId: string): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT l.id AS levelId FROM lessons le
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id WHERE le.id = ?`
		)
		.bind(lessonId)
		.first<{ levelId: string }>()
		.catch(() => null);
	return row?.levelId ?? null;
}

export async function levelIdForQuiz(db: D1Database, quizId: string): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT l.id AS levelId FROM quizzes q
			 JOIN lessons le ON le.id = q.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id WHERE q.id = ?`
		)
		.bind(quizId)
		.first<{ levelId: string }>()
		.catch(() => null);
	return row?.levelId ?? null;
}

export async function levelIdForPack(db: D1Database, packId: string): Promise<{ levelId: string; lessonId: string } | null> {
	const row = await db
		.prepare(
			`SELECT l.id AS levelId, le.id AS lessonId FROM lesson_card_packs p
			 JOIN lessons le ON le.id = p.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id WHERE p.id = ?`
		)
		.bind(packId)
		.first<{ levelId: string; lessonId: string }>()
		.catch(() => null);
	return row ?? null;
}

export function optionsToJson(type: string, body: Record<string, unknown>): string {
	try {
		const fields = {
			options: (body.options ?? body.answers ?? []) as string[],
			pairs: (body.pairs ?? []) as never,
			correct_answer: String(body.correctAnswer ?? body.correct_answer ?? ''),
			settings: body.settings as never
		};
		return JSON.stringify(storedQuestionOptions(type, fields));
	} catch {
		const raw = body.options ?? body.answers ?? [];
		try {
			return JSON.stringify(raw);
		} catch {
			return '[]';
		}
	}
}
