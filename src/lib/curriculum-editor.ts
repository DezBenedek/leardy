import type { LevelNode } from './curriculum';
import { slugify, splitSections } from './markdown';

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
	levelId: string;
	subjectId: string;
	materialTitle: string;
	levelTitle: string;
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

export function serializeEditableSections(sections: EditableSection[]): string {
	const used = new Set(sections.flatMap((section) => section.slug ? [section.slug] : []));
	return sections.map((section) => {
		const body = section.md.trim();
		if (section.intro) return body;
		let slug = section.slug;
		if (!slug) {
			const base = slugify(section.title) || 'bekezdes';
			slug = base;
			let suffix = 2;
			while (used.has(slug)) slug = `${base}-${suffix++}`;
			used.add(slug);
		}
		return `## ${section.title.trim()}\n<!-- section:${slug} -->\n\n${body}`;
	}).join('\n\n');
}
