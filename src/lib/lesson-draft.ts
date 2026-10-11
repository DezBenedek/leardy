import { readLessonContent, type LessonContentV1 } from './lesson-content';

export interface LessonDraft {
	key: string; userId: string; lessonId: string; title: string;
	content: LessonContentV1; revision: number; updatedAt: number;
}
function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('leardy-lesson-drafts-v1', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'key' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
export const lessonDraftKey = (userId: string, lessonId: string) => JSON.stringify([userId, lessonId]);
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await database();
	try {
		return await new Promise((resolve, reject) => {
			const tx = db.transaction('drafts', mode);
			const request = run(tx.objectStore('drafts'));
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally { db.close(); }
}
export async function getLessonDraft(userId: string, lessonId: string): Promise<LessonDraft | null> {
	const value = await transaction<LessonDraft | undefined>('readonly', (store) => store.get(lessonDraftKey(userId, lessonId)));
	if (!value || value.userId !== userId || value.lessonId !== lessonId || typeof value.title !== 'string' || !Number.isSafeInteger(value.revision)) return null;
	// Félbehagyott címet is visszaállítunk, mentéskor a teljes séma ellenőrzi.
	if (!Array.isArray(value.content?.sections) || !readLessonContent({ ...value.content, sections: value.content.sections.map((s) => ({ ...s, title: s.title || 'Névtelen bekezdés' })) })) return null;
	return value;
}
export async function putLessonDraft(draft: LessonDraft): Promise<void> {
	await transaction('readwrite', (store) => store.put(JSON.parse(JSON.stringify(draft))));
}
export async function removeLessonDraft(userId: string, lessonId: string): Promise<void> {
	await transaction('readwrite', (store) => store.delete(lessonDraftKey(userId, lessonId)));
}
