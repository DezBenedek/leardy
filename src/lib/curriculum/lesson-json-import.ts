/* JSON-betöltés leckébe: bekezdések, kártyacsomagok és kvízkérdések.
   Tiszta elemző és ellenőrző, hálózat nélkül. A kérdéseket a szerkesztővel
   azonos piszkozatalakba (QuestionDraft) fordítja, így az import pontosan azt
   hozza létre, amit kézi szerkesztéssel is létre lehetne hozni. */

import { blankQuestion, validateQuestion, type QuestionDraft } from '../quiz/quiz-editor';
import { isQuestionType } from '../question-types/registry';
import { editableLessonDoc, type LessonContentSection } from './lesson-content';
import { markdownLessonDoc } from './lesson-markdown';

export interface JsonImportSection {
	title: string;
	body: string;
}

export interface JsonImportCard {
	front: string;
	back: string;
}

export interface JsonImportDeck {
	title: string;
	cards: JsonImportCard[];
}

export interface LessonJsonImport {
	title?: string;
	sections: JsonImportSection[];
	decks: JsonImportDeck[];
	questions: QuestionDraft[];
}

const MAX_SECTIONS = 100;
const MAX_SECTION_BODY = 100_000;
const MAX_DECKS = 10;
const MAX_CARDS_PER_DECK = 200;
const MAX_CARDS_PER_ITEM = 2000;
const MAX_QUESTIONS = 200;
const MAX_JSON_BYTES = 2_000_000;

const TYPE_ALIASES: Record<string, string> = {
	'true-false': 'tf',
	truefalse: 'tf',
	igazhamis: 'tf',
	feleletvalasztos: 'choice',
	sorrend: 'order',
	parositas: 'match',
	hianyos: 'gap',
	szoveges: 'text'
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function fail(message: string): never {
	throw new Error(message);
}

function str(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function stringList(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	if (!value.every((item) => typeof item === 'string')) return null;
	return value as string[];
}

/** Egy JSON-kérdés QuestionDrafttá alakítása, sorszámozott hibaüzenetekkel. */
function toDraft(item: unknown, index: number): QuestionDraft {
	const label = `${index + 1}. kérdés`;
	if (!isRecord(item)) fail(`${label}: kérdésobjektum kell legyen.`);
	const rawType = str(item.type)?.trim().toLowerCase();
	const type = rawType && TYPE_ALIASES[rawType] ? TYPE_ALIASES[rawType] : (rawType ?? '');
	if (!type || !isQuestionType(type)) {
		fail(`${label}: ismeretlen típus (${str(item.type) ?? 'hiányzik'}). Használható: choice, tf, text, match, order, gap.`);
	}
	if (type === 'map') fail(`${label}: a vaktérkép (map) JSON-ból nem tölthető, a képet a szerkesztőben kell elhelyezni.`);
	const question = str(item.question)?.trim();
	if (!question) fail(`${label}: a question mező kötelező.`);
	if (question.length > 1000) fail(`${label}: a kérdés legfeljebb 1000 karakter lehet.`);
	const draft = blankQuestion('', type);
	draft.question_text = question;
	const image = str(item.image)?.trim();
	if (image) draft.imageUrl = image;

	if (type === 'choice') {
		const options = stringList(item.options);
		if (!options) fail(`${label}: az options tömb kötelező (2-8 válaszlehetőség).`);
		draft.options = options.map((o) => o.trim());
		const answer = item.answer;
		if (Array.isArray(answer)) {
			if (!answer.every((a) => typeof a === 'string')) fail(`${label}: az answer tömb csak szövegeket tartalmazhat.`);
			draft.correct_answer = JSON.stringify((answer as string[]).map((a) => a.trim()));
			draft.settings = { ...(draft.settings ?? {}), multiple: true };
		} else if (typeof answer === 'string') {
			draft.correct_answer = answer.trim();
		} else {
			fail(`${label}: az answer mező kötelező (szöveg vagy tömb több helyes válasznál).`);
		}
	} else if (type === 'tf') {
		const answer = str(item.answer)?.trim();
		if (answer !== 'Igaz' && answer !== 'Hamis') fail(`${label}: az answer csak Igaz vagy Hamis lehet.`);
		draft.correct_answer = answer;
	} else if (type === 'text') {
		const answer = str(item.answer);
		if (answer === null || !answer.trim()) fail(`${label}: az answer mező kötelező.`);
		draft.correct_answer = answer.trim();
	} else if (type === 'match') {
		const raw = item.pairs;
		if (!Array.isArray(raw)) fail(`${label}: a pairs tömb kötelező (2-8 pár).`);
		draft.pairs = raw.map((p, i) => {
			if (!isRecord(p) || typeof p.left !== 'string' || typeof p.right !== 'string') {
				fail(`${label}, ${i + 1}. pár: left és right szövegmező kell.`);
			}
			return { left: p.left.trim(), right: p.right.trim() };
		});
	} else if (type === 'order') {
		const options = stringList(item.options);
		if (!options) fail(`${label}: az options tömb kötelező, helyes sorrendben (2-8 elem).`);
		draft.options = options.map((o) => o.trim());
	} else if (type === 'gap') {
		const text = str(item.text);
		if (text === null || !text.trim()) fail(`${label}: a text mező kötelező, a hiányzó részeket [[szó]] jelöli.`);
		const words = item.words === undefined ? [] : stringList(item.words);
		if (words === null) fail(`${label}: a words csak szövegtömb lehet.`);
		draft.options = words.map((w) => w.trim());
		draft.settings = { mode: 'drag', reusable: false, text };
	}
	draft.sort = index;
	const problem = validateQuestion(draft);
	if (problem) fail(`${label}: ${problem}`);
	return draft;
}

function toSection(item: unknown, index: number): JsonImportSection {
	const label = `${index + 1}. bekezdés`;
	if (!isRecord(item)) fail(`${label}: bekezdésobjektum kell legyen.`);
	const title = str(item.title)?.trim();
	if (!title) fail(`${label}: a title mező kötelező.`);
	if (title.length > 160 || /[\r\n]/.test(title)) fail(`${label}: a cím legfeljebb 160 karakteres, egysoros lehet.`);
	const body = str(item.body ?? item.markdown);
	if (body === null || !body.trim()) fail(`${label}: a body mező kötelező Markdown-szöveggel.`);
	if (body.length > MAX_SECTION_BODY) fail(`${label}: a szöveg legfeljebb ${MAX_SECTION_BODY} karakter lehet.`);
	return { title, body };
}

function toDeck(item: unknown, index: number): JsonImportDeck {
	const label = `${index + 1}. csomag`;
	if (!isRecord(item)) fail(`${label}: csomagobjektum kell legyen.`);
	const title = str(item.title)?.trim();
	if (!title) fail(`${label}: a title mező kötelező.`);
	if (title.length > 76) fail(`${label}: a csomagnév legfeljebb 76 karakter lehet (a folytatás sorszámot kap).`);
	if (!Array.isArray(item.cards) || item.cards.length === 0) fail(`${label}: a cards tömb nem lehet üres.`);
	const cards = item.cards.map((c, i) => {
		if (!isRecord(c) || typeof c.front !== 'string' || typeof c.back !== 'string') {
			fail(`${label}, ${i + 1}. kártya: front és back szövegmező kell.`);
		}
		const front = c.front.trim();
		const back = c.back.trim();
		if (!front || !back) fail(`${label}, ${i + 1}. kártya: mindkét oldal kötelező.`);
		if (front.length > 5000 || back.length > 5000) fail(`${label}, ${i + 1}. kártya: oldalanként legfeljebb 5000 karakter.`);
		return { front, back };
	});
	return { title, cards };
}

/**
 * Lecke-JSON elemzése és ellenőrzése. Hibánál az első probléma magyar
 * üzenetével dob. A 200-nál több kártyás csomagokat (2), (3) sorszámú
 * folytatáscsomagokra bontja.
 */
export function parseLessonJsonImport(raw: string): LessonJsonImport {
	if (typeof raw !== 'string' || !raw.trim()) fail('Üres bemenet, illessz be JSON-szöveget vagy válassz fájlt.');
	if (raw.length > MAX_JSON_BYTES) fail('A JSON túl nagy, legfeljebb 2 MB tölthető be.');
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		fail('Érvénytelen JSON. Ellenőrizd a zárójeleket és a vesszőket.');
	}
	if (!isRecord(parsed)) fail('A legfelső szint egy objektum kell legyen: { "sections": [...], "decks": [...], "quiz": [...] }.');
	const title = parsed.title === undefined ? undefined : str(parsed.title)?.trim() || undefined;
	if (parsed.title !== undefined && !title) fail('A title csak nem üres szöveg lehet.');
	if (title && title.length > 160) fail('A leckecím legfeljebb 160 karakter lehet.');

	const sectionsRaw = parsed.sections === undefined ? [] : parsed.sections;
	const decksRaw = parsed.decks === undefined ? [] : parsed.decks;
	const quizRaw = parsed.quiz === undefined ? [] : parsed.quiz;
	if (!Array.isArray(sectionsRaw) || !Array.isArray(decksRaw) || !Array.isArray(quizRaw)) {
		fail('A sections, decks és quiz mezők tömbök kell legyenek.');
	}
	if (sectionsRaw.length > MAX_SECTIONS) fail(`Legfeljebb ${MAX_SECTIONS} bekezdés tölthető be egyszerre.`);
	if (decksRaw.length > MAX_DECKS) fail(`Legfeljebb ${MAX_DECKS} csomag tölthető be egyszerre.`);
	if (quizRaw.length > MAX_QUESTIONS) fail(`Legfeljebb ${MAX_QUESTIONS} kérdés tölthető be egyszerre.`);
	if (sectionsRaw.length + decksRaw.length + quizRaw.length === 0) {
		fail('Nincs betölthető tartalom. Adj meg sections, decks vagy quiz tömböt.');
	}
	const sections = sectionsRaw.map(toSection);
	const decks: JsonImportDeck[] = [];
	for (const item of decksRaw.map(toDeck)) {
		if (item.cards.length > MAX_CARDS_PER_ITEM) {
			fail(`A(z) ${item.title} csomag túl nagy: legfeljebb ${MAX_CARDS_PER_ITEM} kártya tölthető be egyszerre.`);
		}
		if (item.cards.length <= MAX_CARDS_PER_DECK) {
			decks.push(item);
			continue;
		}
		let part = 1;
		for (let i = 0; i < item.cards.length; i += MAX_CARDS_PER_DECK) {
			decks.push({
				title: part === 1 ? item.title : `${item.title.slice(0, 74)} (${part})`,
				cards: item.cards.slice(i, i + MAX_CARDS_PER_DECK)
			});
			part++;
		}
	}
	const questions = quizRaw.map(toDraft);
	return { ...(title ? { title } : {}), sections, decks, questions };
}

/** Importált bekezdések a leckeszerkesztő szakaszalakjába fordítva. */
export function importSectionsToContent(sections: JsonImportSection[]): LessonContentSection[] {
	return sections.map((section) => ({
		slug: `bekezdes-${crypto.randomUUID()}`,
		title: section.title,
		intro: false,
		doc: editableLessonDoc(markdownLessonDoc(section.body))
	}));
}
