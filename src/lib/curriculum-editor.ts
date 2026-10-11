import type { LevelNode } from './curriculum';
import { slugify, splitSections } from './markdown';
import type { LessonContentV1 } from './lesson-content';

export interface EditorLevel extends LevelNode {
	published: boolean;
	canEdit: boolean;
	ownerId: string | null;
	ownerEmail: string | null;
	editors: string[];
}

export interface EditorCandidate {
	id: string;
	name: string;
	email: string;
}

export interface EditorLesson {
	id: string;
	title: string;
	body_md: string;
	content?: LessonContentV1 | null;
	contentRevision?: number;
	levelId: string;
	subjectId: string;
	materialTitle: string;
	levelTitle: string;
}

/** Kvízblokk a lecke szerkesztőhöz: lecke szintű lista eleme. */
export interface EditorQuestion {
	id: string;
	quiz_id: string;
	question_text: string;
	imageUrl?: string;
	settings?: import('./question-types/types').QuestionSettings;
	type: string;
	options: string[];
	pairs: { left: string; right: string }[];
	correct_answer: string;
	sectionSlug: string;
	sort: number;
}

export interface EditorQuiz {
	id: string;
	title: string;
	section_slug: string;
	sort: number;
	questions: EditorQuestion[];
}

/** A bekezdések címsorai és nyers tartalma veszteség nélkül szerkeszthetők. */
export interface EditableSection {
	id: string;
	title: string;
	md: string;
	intro: boolean;
	/** Mentés után állandó, átnevezés és átrendezés sem módosítja. */
	slug?: string;
}

export function parseEditableSections(md: string): EditableSection[] {
	return splitSections(md).map((section) => ({
		id: section.slug, slug: section.slug, title: section.title, md: section.md, intro: !!section.intro
	}));
}

/** A mentett hivatkozások rögzítése a mezők azonosítójának és tartalmának cseréje nélkül. */
export function withEditableSectionSlugs(sections: EditableSection[]): EditableSection[] {
	const used = new Set(sections.flatMap((section) => section.slug ? [section.slug] : []));
	return sections.map((section) => {
		if (section.intro || section.slug) return section;
		const base = slugify(section.title) || 'bekezdes';
		let slug = base;
		let suffix = 2;
		while (used.has(slug)) slug = `${base}-${suffix++}`;
		used.add(slug);
		return { ...section, slug };
	});
}

export function serializeEditableSections(sections: EditableSection[]): string {
	return withEditableSectionSlugs(sections).map((section) => {
		const body = section.md.trim();
		if (section.intro) return body;
		const slug = section.slug;
		return `## ${section.title.trim()}\n<!-- section:${slug} -->\n\n${body}`;
	}).join('\n\n');
}
