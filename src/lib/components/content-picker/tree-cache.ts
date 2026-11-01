import type {
	LevelNode,
	MaterialNode,
	Subject,
	SubjectTree
} from '$lib/curriculum/curriculum';
import { getOrFetch, peek } from '$lib/state/query.svelte';
import { contentFetch } from '$lib/content/content-client';
import type { ContentPick, Step } from './types';

export const COUNTS_TTL = 60 * 60_000;
export const EDITOR_TREE_TTL = 5 * 60_000;

/** A gyorstár-függvények által olvasott és írt vezérlőállapot. */
export interface TreeCacheState {
	trees: Record<string, SubjectTree>;
	quizCounts: Record<string, Record<string, number>>;
	subjectQuizCounts: Record<string, number>;
	liveSubjects: Subject[] | null;
	loadingTree: boolean;
	loadingSubjectCounts: boolean;
	treeError: boolean;
	treeVersion: number;
	readonly selectionVersion: number;
	subject: Subject | null;
	level: LevelNode | null;
	topic: MaterialNode | null;
	trail: Step[];
	selected: ContentPick[];
	readonly open: boolean;
	loadTree?: (subjectId: string) => Promise<SubjectTree | null>;
	treeTimes: Map<string, number>;
	treeRequests: Map<string, Promise<SubjectTree | null>>;
}

export function cachedTree(s: TreeCacheState, id: string): SubjectTree | null {
	if (s.trees[id] && Date.now() - (s.treeTimes.get(id) ?? 0) < (s.loadTree ? EDITOR_TREE_TTL : COUNTS_TTL)) return s.trees[id];
	if (s.loadTree) return null;
	const cached = peek<{ tree: SubjectTree; counts?: Record<string, number> }>(`counts:tree:${id}`, COUNTS_TTL);
	if (!cached) return null;
	s.trees = { ...s.trees, [id]: cached.tree };
	s.treeTimes.set(id, Date.now());
	if (cached.counts) s.quizCounts = { ...s.quizCounts, [id]: cached.counts };
	return cached.tree;
}

/** A korábbi csatolmányoknál csak az elem azonosítója maradhatott meg. */
export function refreshSelected(
	selected: ContentPick[],
	id: string,
	updated: SubjectTree
): ContentPick[] {
	return selected.flatMap((pick) => {
		if (pick.subjectId !== id) return [pick];
		for (const l of updated.levels) {
			if (pick.kind === 'level' && pick.levelId === l.id) return [pick];
			for (const m of l.materials) {
				const lesson = pick.kind === 'lesson' ? m.lessons.find((le) => le.id === pick.lessonId) : null;
				if (!lesson && !(pick.kind === 'topic' && pick.topicId === m.id)) continue;
				return [{ ...pick, subjectTitle: updated.title, levelId: l.id, levelTitle: l.title,
					topicId: m.id, topicTitle: m.title, lessonTitle: lesson?.title ?? '',
					crumb: [updated.title, l.title, m.title, lesson?.title].filter(Boolean).join(' - ') }];
			}
		}
		return [];
	});
}

export async function ensureSubjectCounts(s: TreeCacheState, cacheOnly = false): Promise<void> {
	if (s.loadingSubjectCounts) return;
	const version = s.selectionVersion;
	s.loadingSubjectCounts = true;
	try {
		// Megosztott gyorstár: a számlálók ritkán változnak, oldalak között is élnek.
		const counts = await getOrFetch<{ subjects: Subject[]; quizCountsBySubject: Record<string, number> }>(
			'counts:subjects',
			async () => {
				const res = await contentFetch('/api/browse?quizcounts=1', cacheOnly);
				const j = await res.json().catch(() => ({}));
				if (!res.ok || !j.quizCountsBySubject) throw new Error('net');
				return j as { subjects: Subject[]; quizCountsBySubject: Record<string, number> };
			},
			COUNTS_TTL, 0, true
		);
		if (!s.open || s.loadTree || version !== s.selectionVersion) return;
		s.subjectQuizCounts = counts.quizCountsBySubject;
		s.liveSubjects = counts.subjects;
		if (s.subject) {
			const updated = counts.subjects.find((x) => x.id === s.subject?.id);
			if (updated) s.subject = updated;
			else { s.subject = null; s.level = null; s.topic = null; s.trail = ['subject']; }
		}
		s.selected = s.selected.filter((p) => counts.subjects.some((x) => x.id === p.subjectId));
	} catch {
		// szűrés nélkül marad
	} finally {
		s.loadingSubjectCounts = false;
	}
}

export async function ensureTree(
	s: TreeCacheState,
	id: string,
	cacheOnly = false
): Promise<SubjectTree | null> {
	s.treeVersion = s.treeVersion + 1;
	const version = s.treeVersion;
	s.treeError = false;
	const cached = cachedTree(s, id);
	if (cached && s.loadTree) { s.loadingTree = false; return cached; }
	s.loadingTree = !cached;
	try {
		if (s.loadTree) {
			let request = s.treeRequests.get(id);
			if (!request) {
				request = s.loadTree(id);
				s.treeRequests.set(id, request);
			}
			let loaded: SubjectTree | null;
			try { loaded = await request; }
			finally { if (s.treeRequests.get(id) === request) s.treeRequests.delete(id); }
			if (loaded && version === s.treeVersion) {
				s.trees = { ...s.trees, [id]: loaded };
				s.treeTimes.set(id, Date.now());
			}
			return loaded;
		}
		const got = await getOrFetch<{ tree: SubjectTree; counts?: Record<string, number> }>(
			`counts:tree:${id}`,
			async () => {
				const res = await contentFetch(
					`/api/browse?subject=${encodeURIComponent(id)}&quizcounts=1`, cacheOnly
				);
				const j = await res.json().catch(() => ({}));
				if (!res.ok || !j.tree) throw new Error('net');
				return { tree: j.tree as SubjectTree, counts: j.quizCounts as Record<string, number> | undefined };
			},
			COUNTS_TTL, 0, true
		);
		if (version === s.treeVersion) {
			s.trees = { ...s.trees, [id]: got.tree };
			s.treeTimes.set(id, Date.now());
			if (got.counts) s.quizCounts = { ...s.quizCounts, [id]: got.counts };
			if (s.subject?.id === id) {
				const nextLevel = got.tree.levels.find((l) => l.id === s.level?.id) ?? null;
				const nextTopic = nextLevel?.materials.find((m) => m.id === s.topic?.id) ?? null;
				if (s.level && !nextLevel) s.trail = s.trail.filter((x) => x === 'subject' || x === 'level');
				else if (s.topic && !nextTopic) s.trail = s.trail.filter((x) => x !== 'lesson');
				s.level = nextLevel; s.topic = nextTopic;
				s.selected = refreshSelected(s.selected, id, got.tree);
			}
		}
		return got.tree;
	} catch {
		if (version === s.treeVersion) s.treeError = true;
		return null;
	} finally {
		if (version === s.treeVersion) s.loadingTree = false;
	}
}
