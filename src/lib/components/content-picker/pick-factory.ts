import type {
	LessonRef,
	LevelNode,
	MaterialNode,
	Subject
} from '$lib/curriculum/curriculum';
import type { ContentPick, Step } from './types';

export function pickId(
	selected: ContentPick[],
	kind: 'lesson' | 'topic',
	id: string
): boolean {
	return selected.some(
		(p) => p.kind === kind && (kind === 'lesson' ? p.lessonId === id : p.topicId === id)
	);
}

export function makePick(
	subject: Subject | null,
	kind: 'lesson' | 'topic',
	l: LevelNode,
	m: MaterialNode,
	le: LessonRef | undefined,
	quizCountOf: (lessonId: string) => number
): ContentPick | null {
	if (!subject) return null;
	const base = `${subject.title} - ${l.title} - ${m.title}`;
	if (kind === 'topic') {
		return {
			kind,
			subjectId: subject.id,
			subjectTitle: subject.title,
			levelId: l.id,
			levelTitle: l.title,
			levelLabel: 'Tananyag',
			topicId: m.id,
			topicTitle: m.title,
			lessonId: '',
			lessonTitle: '',
			quizCount: m.lessons.reduce((n, x) => n + quizCountOf(x.id), 0),
			crumb: base
		};
	}
	if (!le) return null;
	return {
		kind,
		subjectId: subject.id,
		subjectTitle: subject.title,
		levelId: l.id,
		levelTitle: l.title,
		levelLabel: 'Tananyag',
		topicId: m.id,
		topicTitle: m.title,
		lessonId: le.id,
		lessonTitle: le.title,
		quizCount: quizCountOf(le.id),
		crumb: `${base} - ${le.title}`
	};
}

export function togglePick(
	selected: ContentPick[],
	kind: 'lesson' | 'topic',
	subject: Subject | null,
	l: LevelNode,
	m: MaterialNode,
	le: LessonRef | undefined,
	quizCountOf: (lessonId: string) => number
): ContentPick[] {
	const id = kind === 'lesson' ? (le?.id ?? '') : m.id;
	if (!id) return selected;
	if (pickId(selected, kind, id)) {
		return selected.filter(
			(p) => !(p.kind === kind && (kind === 'lesson' ? p.lessonId === id : p.topicId === id))
		);
	}
	const p = makePick(subject, kind, l, m, le, quizCountOf);
	if (p) return [...selected, p];
	return selected;
}

export function crumbSoFar(
	subject: Subject | null,
	level: LevelNode | null,
	topic: MaterialNode | null,
	step: Step,
	query: string
): string {
	const parts: string[] = [];
	if (subject && step !== 'subject' && step !== 'level') parts.push(subject.title);
	if (level && (step === 'topic' || step === 'lesson')) parts.push(level.title);
	if (topic && step === 'lesson' && query.trim() === '') parts.push(topic.title);
	return parts.join(' - ');
}
