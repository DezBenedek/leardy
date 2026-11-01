import type {
	LevelNode,
	Subject,
	SubjectTree
} from '$lib/curriculum/curriculum';

export interface ContentPick {
	kind: 'lesson' | 'topic' | 'level';
	subjectId: string;
	subjectTitle: string;
	levelId: string;
	levelTitle: string;
	levelLabel: string;
	topicId: string;
	topicTitle: string;
	/** Témakör-választásnál üres. */
	lessonId: string;
	lessonTitle: string;
	quizCount: number;
	/** Morzsa: "Angol - B2 - Unit 1 - B" vagy témakörnél rövidebb. */
	crumb: string;
}

export interface Props {
	open: boolean;
	subjects: Subject[];
	baseSubjectId?: string;
	/** Nyitáskor erről a tantárgyról indul, a tantárgylistára vissza lehet lépni. */
	startSubjectId?: string;
	/** Az útmutató a megőrzött választástól függetlenül nyithatja meg a lépést. */
	tutorialStep?: 'subject' | 'level';
	select?: 'lesson' | 'topic' | 'level';
	/** Szerkesztői használatban a piszkozatokat is tartalmazó adatforrás. */
	loadTree?: (subjectId: string) => Promise<SubjectTree | null>;
	/** A szerverről már betöltött fa az első nyitáskor is azonnal használható. */
	initialTree?: SubjectTree | null;
	/** Mentés vagy jogosultságváltozás után megváltozó érték üríti a saját gyorstárat. */
	cacheVersion?: unknown;
	selectedLevelId?: string;
	includeAllLevels?: boolean;
	selectedSubjectId?: string;
	searchable?: boolean;
	/** Például a szerkesztési jogosultság jelzése a tananyag sorában. */
	levelNote?: (level: LevelNode) => string;
	onCreateLevel?: (subjectId: string) => void;
	multi?: boolean;
	onlyWithQuiz?: boolean;
	/** Többszöri nyitásnál megőrzött választás (multi). */
	initialSelected?: ContentPick[];
	onClose: () => void;
	onPick: (picks: ContentPick[]) => void;
}

export type Step = 'subject' | 'level' | 'topic' | 'lesson';
