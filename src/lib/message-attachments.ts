export type AttachmentType = 'subject' | 'lesson' | 'quiz' | 'deck' | 'topic';

export interface MessageAttachment {
	ref_type: AttachmentType;
	ref_id: string;
	ref_title: string;
}

const types: AttachmentType[] = ['subject', 'lesson', 'quiz', 'deck', 'topic'];

/** A régi, teljes útvonalból is a tananyag és a kiválasztott elem neve látszik. */
export function attachmentTitle(title: string, subjectTitle?: string): string {
	if (subjectTitle && !title.startsWith(`${subjectTitle} - `)) return title;
	const parts = title.split(' - ');
	return parts.length > 2 ? `${parts[1]} - ${parts[parts.length - 1]}` : title;
}

export function parseMessageAttachments(input: unknown): MessageAttachment[] {
	if (!Array.isArray(input)) return [];
	const refs: MessageAttachment[] = [];
	for (const item of input.slice(0, 10)) {
		if (!item || typeof item !== 'object') continue;
		const type = String(item.ref_type ?? '') as AttachmentType;
		const id = String(item.ref_id ?? '').trim().slice(0, 120);
		if (!types.includes(type) || !id || refs.some((r) => r.ref_type === type && r.ref_id === id)) continue;
		refs.push({ ref_type: type, ref_id: id, ref_title: String(item.ref_title ?? '').trim().slice(0, 300) });
	}
	return refs;
}
