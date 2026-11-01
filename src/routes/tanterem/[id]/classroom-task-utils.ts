import { lessonPath } from '$lib/curriculum/lesson-paths';
import type { ContentPick } from '$lib/components/ContentPicker.svelte';

export interface FeedMessage {
	id: string;
	title: string;
	body: string;
	teacher_name?: string;
	ref_type: string | null;
	ref_id: string | null;
	ref_title: string | null;
	refs: { ref_type: string; ref_id: string; ref_title: string }[];
	created_at: number;
}

export interface FeedTask {
	id: string;
	title: string;
	lesson_ids_json: string;
	question_count: number;
	target_pct: number;
	shuffle: number;
	due_date: number | null;
	created_at: number;
}

export interface FeedAssignment {
	id: string;
	title: string;
	description: string;
	due_date: number | null;
	require_text: number;
	min_chars: number;
	require_images: number;
	max_images: number;
	require_files: number;
	max_files: number;
	require_audio: number;
	created_at: number;
}

export interface UploadItem {
	id: string;
	kind: string;
	file_name: string;
	mime: string;
	size: number;
	width: number | null;
	height: number | null;
	created_at: number;
}

export interface Member {
	id: string;
	name: string;
	joined_at: number;
}

export interface LiveRow {
	id: string;
	title: string;
	status: string;
	created_at: number;
	total: number;
	done: number;
	source?: string;
	pacing?: string;
	orderMode?: string;
	playMode?: string;
}

export interface AssignmentMine {
	text_body: string;
	submitted: number;
	submitted_at: number | null;
	updated_at: number;
	grade: number | null;
	feedback: string;
	graded_at: number | null;
}

export interface AssignmentRow {
	user_id: string;
	name: string;
	text_body: string;
	submitted: number;
	submitted_at: number | null;
	grade: number | null;
	feedback: string;
	graded_at: number | null;
	image_count: number;
	file_count: number;
	uploads: UploadItem[];
}

export type FeedItem =
	| { kind: 'message'; ts: number; msg: FeedMessage }
	| { kind: 'task'; ts: number; task: FeedTask }
	| { kind: 'assignment'; ts: number; assignment: FeedAssignment };

export function draftSummary(s: LiveRow): string {
	const parts: string[] = [];
	if (s.total > 0) parts.push(`${s.total} kérdés`);
	parts.push(s.source === 'deck' ? 'Kártyák' : 'Lecke kvízek');
	parts.push(s.pacing === 'synced' ? 'Együtt' : 'Saját tempó');
	if (s.orderMode === 'shuffled') parts.push('Kevert');
	if (s.playMode === 'stage') parts.push('Tantermi');
	return parts.join(' · ');
}

export function taskLessonTitle(p: ContentPick): string {
	return p.levelTitle ? `${p.levelTitle} - ${p.lessonTitle}` : p.lessonTitle;
}

export function parseTaskLessons(t: FeedTask): { id: string; title: string }[] {
	try {
		const raw = JSON.parse(t.lesson_ids_json) as unknown;
		if (!Array.isArray(raw)) return [];
		return raw
			.map((l) => {
				if (typeof l === 'string') return { id: l, title: 'Lecke' };
				const o = l as { id?: unknown; title?: unknown };
				return { id: String(o.id ?? ''), title: String(o.title ?? 'Lecke') };
			})
			.filter((l) => l.id);
	} catch {
		return [];
	}
}

export function messageChips(m: FeedMessage): { ref_type: string; ref_id: string; ref_title: string }[] {
	if (m.refs && m.refs.length > 0) return m.refs;
	if (m.ref_type && m.ref_id) {
		return [{ ref_type: m.ref_type, ref_id: m.ref_id, ref_title: m.ref_title ?? '' }];
	}
	return [];
}

export function attachHrefFor(t: string | null, id: string | null): string | null {
	if (!t || !id) return null;
	if (t === 'subject') return '/tanulas';
	if (t === 'lesson' || t === 'quiz') return lessonPath(id);
	if (t === 'deck') {
		if (id.startsWith('deck:')) return `/kartyak/${id.slice(5)}`;
		return '/kartyak/felfedezes';
	}
	return null;
}

export function assignmentStatus(r: AssignmentRow): string {
	if (r.grade !== null && r.grade !== undefined) return `Értékelve: ${r.grade}`;
	if (r.submitted === 1) return 'Beküldve';
	const audioCount = r.uploads.filter((u) => u.kind === 'audio').length;
	if (r.text_body || r.image_count > 0 || r.file_count > 0 || audioCount > 0) return 'Dolgozik rajta';
	return 'Még nem kezdte';
}

export function audioFileName(blob: Blob): string {
	const t = blob.type || '';
	if (t.includes('mp4') || t.includes('aac') || t.includes('m4a')) return 'hangfelvetel.m4a';
	if (t.includes('webm') || t.includes('opus') || t.includes('ogg')) return 'hangfelvetel.webm';
	return 'hangfelvetel.wav';
}

export function uploadUrl(roomId: string, aid: string, uploadId: string): string {
	return `/api/classrooms/${roomId}/assignments/${aid}/uploads/${uploadId}`;
}
