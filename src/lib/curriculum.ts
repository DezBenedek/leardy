/* Tanterv-típusok: Tantárgy → Szint → Tananyag → Lecke, szekcióhoz kötött kvízekkel.
   Szerződés a server-oldal (server/curriculum.ts) és a felület között. */

export interface Subject {
	id: string;
	title: string;
	icon: string;
	sort: number;
	levelCount: number;
	lessonCount: number;
	/** A szint-választó címkéje ennél a tantárgynál ("Szint", "Évfolyam", ...). */
	levelLabel: string;
}

export interface LessonRef {
	id: string;
	title: string;
	sort: number;
	/** A bejelentkezett felhasználó teljesítette-e. */
	done: boolean;
}

export interface MaterialNode {
	id: string;
	title: string;
	sort: number;
	lessons: LessonRef[];
}

export interface LevelNode {
	id: string;
	title: string;
	sort: number;
	materials: MaterialNode[];
}

export interface SubjectTree extends Subject {
	levels: LevelNode[];
}

export interface QuizPair {
	left: string;
	right: string;
}

export interface QuizQuestion {
	id: string;
	question_text: string;
	type: string;
	/** choice/order/tf esetén string-tömb; match esetén üres. */
	options: string[];
	/** match esetén a párok. */
	pairs: QuizPair[];
	correct_answer: string;
	/** Saját kártya bekezdés-besorolása (lecke szekció-slugja, üres = nincs). */
	sectionSlug?: string;
}

export interface Quiz {
	id: string;
	title: string;
	/** Melyik markdown-szekcióhoz tartozik (üres = egész lecke). */
	section_slug: string;
	questions: QuizQuestion[];
}

export interface LessonPage {
	lesson: { id: string; title: string; body_md: string };
	material: { id: string; title: string };
	level: { id: string; title: string };
	subject: { id: string; title: string };
	quizzes: Quiz[];
}

export interface LessonSection {
	slug: string;
	title: string;
	/** A szekció nyers markdownja (cím nélkül). */
	md: string;
}

export interface Suggestion {
	lessonId: string;
	title: string;
	subjectTitle: string;
}

export interface HomeStats {
	streak: number;
	todayDone: number;
}

/* Gyakorlócsomag-szerződés a server-oldal (server/curriculum.ts: listScopedPackages)
   és a felület (/gyakorlas, QuickPractice) között. */
export interface Package {
	quizId: string;
	title: string;
	sectionSlug: string;
	lessonId: string;
	lessonTitle: string;
	materialTitle: string;
	subjectTitle: string;
	levelTitle: string;
	/** Szűréshez az azonosítók is (könyvtár kliensoldali szűrése). */
	subjectId?: string;
	levelId?: string;
	questionCount: number;
	questions: QuizQuestion[];
	/** Saját, felhasználó által létrehozott csomag. */
	mine?: boolean;
	/** Saját csomag fajtája: kártyázós vagy kvízes. */
	kind?: 'cards' | 'quiz';
	/** Saját csomag csatolt leckéje (üres = nincs). */
	attachedLessonId?: string;
	attachedLessonTitle?: string;
}

/** Kártyázható-e a kérdés (egyértelmű szöveges válaszú)? */
export function isCardable(q: QuizQuestion): boolean {
	return (
		(q.type === 'choice' || q.type === 'text' || q.type === 'tf') &&
		!!q.correct_answer?.trim()
	);
}
