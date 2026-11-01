import { resolve } from '$app/paths';

/** A lecke adatbázis-azonosítója átnevezéskor is állandó. */
export function lessonPath(id: string, sectionSlug?: string): string {
	const path = resolve('/tanulas/lecke/[id]', { id: encodeURIComponent(id) });
	return sectionSlug ? `${path}#${encodeURIComponent(sectionSlug)}` : path;
}

export function lessonEditorPath(id: string): string {
	return resolve('/tanulas/szerkeszto/lecke/[id]', { id: encodeURIComponent(id) });
}
