import type {
	LevelNode,
	MaterialNode,
	Subject,
	SubjectTree
} from '$lib/curriculum/curriculum';
import { motionOK } from '$lib/view/overlay';
import type { ContentPick } from './types';

/** A lépésnavigáció által olvasott és írt vezérlőállapot. */
export interface NavState {
	trail: ('subject' | 'level' | 'topic' | 'lesson')[];
	subject: Subject | null;
	level: LevelNode | null;
	topic: MaterialNode | null;
	starting: boolean;
	loadingTree: boolean;
	pendingSubjectId: string;
	selected: ContentPick[];
	query: string;
	direction: number;
	animate: boolean;
	treeError: boolean;
	readonly open: boolean;
	selectionVersion: number;
	treeVersion: number;
	cacheOwner: unknown;
	liveSubjects: Subject[] | null;
	trees: Record<string, SubjectTree>;
	treeTimes: Map<string, number>;
	treeRequests: Map<string, Promise<SubjectTree | null>>;
}

export interface NavDeps {
	select: 'lesson' | 'topic' | 'level';
	baseSubjectId: string;
	startSubjectId: string;
	tutorialStep: 'subject' | 'level' | undefined;
	initialSelected: ContentPick[];
	initialTree: SubjectTree | null;
	cacheVersion: unknown;
	loadTree?: (subjectId: string) => Promise<SubjectTree | null>;
	availableSubjects: Subject[];
	levelLabel: string;
	onlyWithQuiz: boolean;
	levelPass(l: LevelNode): boolean;
	topicPass(m: MaterialNode): boolean;
	cachedTree(id: string): SubjectTree | null;
	ensureTree(id: string, cacheOnly?: boolean): Promise<SubjectTree | null>;
	ensureSubjectCounts(cacheOnly?: boolean): Promise<void>;
	onPick(picks: ContentPick[]): void;
	onClose(): void;
	signalScopeSubject(info: { subjectId: string; levelLabel: string }): void;
}

export function reset(s: NavState, d: NavDeps): void {
	s.selectionVersion++;
	s.treeVersion++;
	s.pendingSubjectId = '';
	s.animate = motionOK();
	s.direction = 1;
	s.treeError = false;
	s.trail = [];
	s.subject = null;
	s.level = null;
	s.topic = null;
	s.starting = false;
	s.loadingTree = false;
	s.selected = [...d.initialSelected];
	s.query = '';
	const owner = d.cacheVersion ?? d.loadTree;
	if (owner !== s.cacheOwner) {
		s.cacheOwner = owner;
		s.liveSubjects = null;
		s.trees = {};
		s.treeTimes.clear();
		s.treeRequests.clear();
	}
	if (d.initialTree) {
		s.trees = { ...s.trees, [d.initialTree.id]: d.initialTree };
		s.treeTimes.set(d.initialTree.id, Date.now());
	}
}

export async function start(s: NavState, d: NavDeps): Promise<void> {
	reset(s, d);
	if (!d.loadTree) void d.ensureSubjectCounts();
	const initialSubjectId = d.tutorialStep === 'subject' ? '' : d.baseSubjectId || d.startSubjectId;
	const base = d.availableSubjects.find((x) => x.id === initialSubjectId) ?? null;
	if (base) {
		if (!d.baseSubjectId) s.trail = ['subject'];
		s.subject = base;
		const cached = d.cachedTree(base.id);
		if (cached) { pushFirstStep(s, d, cached); void d.ensureTree(base.id); return; }
		if (d.select === 'level') s.trail = [...s.trail, 'level'];
		s.starting = true;
		const version = s.selectionVersion;
		const t = await d.ensureTree(base.id);
		if (!s.open || version !== s.selectionVersion) return;
		s.starting = false;
		if (d.select !== 'level') pushFirstStep(s, d, t);
	} else {
		s.subject = null;
		s.trail = ['subject'];
		if (d.onlyWithQuiz) void d.ensureSubjectCounts();
	}
}

export function pushFirstStep(s: NavState, d: NavDeps, t: SubjectTree | null): void {
	if (d.select === 'level') { s.trail = [...s.trail, 'level']; return; }
	if (!t || t.levels.length === 0) return;
	const levels = t.levels.filter((l) => d.levelPass(l));
	if (levels.length === 1) chooseLevel(s, d, levels[0]);
	else s.trail = [...s.trail, 'level'];
}

export async function chooseSubject(s: NavState, d: NavDeps, sub: Subject): Promise<void> {
	const version = ++s.selectionVersion;
	s.direction = 1;
	s.pendingSubjectId = sub.id;
	s.subject = sub;
	s.level = null;
	s.topic = null;
	s.query = '';
	s.starting = false;
	s.trail = [...s.trail, 'level'];
	const cached = d.cachedTree(sub.id);
	if (cached && !d.loadTree) void d.ensureTree(sub.id);
	const t = cached ?? await d.ensureTree(sub.id);
	if (!s.open || version !== s.selectionVersion) return;
	s.pendingSubjectId = '';
	if (d.select === 'level') {
		if (t) d.signalScopeSubject({ subjectId: sub.id, levelLabel: sub.levelLabel });
		return;
	}
	// Egyszintes fa: a tananyag-lépést átugorjuk.
	const levels = (t?.levels ?? []).filter((l) => d.levelPass(l));
	if (t && levels.length === 1) chooseLevel(s, d, levels[0]);
}

export function chooseAllLevels(s: NavState, d: NavDeps): void {
	if (!s.subject) return;
	d.onPick([{ kind: 'level', subjectId: s.subject.id, subjectTitle: s.subject.title,
		levelId: '', levelTitle: 'Minden tananyag', levelLabel: 'Tananyag',
		topicId: '', topicTitle: '', lessonId: '', lessonTitle: '', quizCount: 0,
		crumb: s.subject.title }]);
}

export function chooseLevel(s: NavState, d: NavDeps, l: LevelNode): void {
	if (d.select === 'level' && s.subject) {
		d.onPick([{
			kind: 'level', subjectId: s.subject.id, subjectTitle: s.subject.title,
			levelId: l.id, levelTitle: l.title, levelLabel: d.levelLabel,
			topicId: '', topicTitle: '', lessonId: '', lessonTitle: '', quizCount: 0,
			crumb: `${s.subject.title} - ${l.title}`
		}]);
		return;
	}
	s.level = l;
	s.topic = null;
	s.query = '';
	const mats = l.materials.filter((m) => d.topicPass(m));
	// Egytémakörös tananyag lecke-módban: egyből a leckék.
	if (d.select === 'lesson' && mats.length === 1) chooseTopic(s, l, mats[0], true);
	else s.trail = [...s.trail, 'topic'];
}

export function chooseTopic(s: NavState, l: LevelNode, m: MaterialNode, fromSkip = false): void {
	s.level = l;
	s.topic = m;
	s.query = '';
	if (!fromSkip) s.trail = [...s.trail, 'lesson'];
	else s.trail = [...s.trail, 'topic', 'lesson'];
}

export function goBack(s: NavState, d: NavDeps): void {
	s.selectionVersion++;
	s.treeVersion++;
	s.pendingSubjectId = '';
	s.loadingTree = false;
	s.direction = -1;
	const cur = s.trail[s.trail.length - 1];
	s.trail = s.trail.slice(0, -1);
	s.query = '';
	if (cur === 'topic') s.topic = null;
	else if (cur === 'level') {
		s.level = null;
		s.topic = null;
	} else if (cur === 'subject') {
		s.subject = null;
		s.level = null;
		s.topic = null;
	}
	if (s.trail.length === 0) d.onClose();
}
