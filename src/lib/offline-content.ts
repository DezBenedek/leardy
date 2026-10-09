import type { LessonRef, Subject, SubjectTree } from './curriculum';
import { CONTENT_CACHE, PRIVATE_CACHE_PREFIX, type LessonDocument } from './content-protocol';

export interface OfflineCatalog {
	subjects: Subject[];
	trees: Record<string, SubjectTree>;
	lessons: LessonDocument[];
}

/** A katalógusban szereplő cím önmagában nem jelent letöltött leckét. */
export function buildOfflineCatalog(lessons: LessonDocument[], subjects: Subject[] = [], metadata: SubjectTree[] = []): OfflineCatalog {
	const trees: Record<string, SubjectTree> = {};
	for (const document of lessons) {
		const { lesson, material, level, subject } = document.lessonPage;
		const source = metadata.find((tree) => tree.id === subject.id);
		const sourceLevel = source?.levels.find((node) => node.id === level.id);
		const sourceMaterial = sourceLevel?.materials.find((node) => node.id === material.id);
		const sourceLesson = sourceMaterial?.lessons.find((node) => node.id === lesson.id);
		const info = subjects.find((node) => node.id === subject.id) ?? source;
		const tree = trees[subject.id] ??= {
			id: subject.id, title: subject.title, icon: info?.icon ?? 'book', sort: info?.sort ?? 0,
			levelLabel: info?.levelLabel ?? 'Tananyag', levelCount: 0, lessonCount: 0, packCount: 0, levels: []
		};
		let targetLevel = tree.levels.find((node) => node.id === level.id);
		if (!targetLevel) tree.levels.push(targetLevel = { ...level, sort: sourceLevel?.sort ?? 0, materials: [] });
		let targetMaterial = targetLevel.materials.find((node) => node.id === material.id);
		if (!targetMaterial) targetLevel.materials.push(targetMaterial = { ...material, sort: sourceMaterial?.sort ?? 0, lessons: [] });
		targetMaterial.lessons.push({ id: lesson.id, title: lesson.title, sort: sourceLesson?.sort ?? 0, done: sourceLesson?.done ?? false } satisfies LessonRef);
	}
	const order = (a: { sort: number; title: string }, b: { sort: number; title: string }) => a.sort - b.sort || a.title.localeCompare(b.title, 'hu');
	for (const tree of Object.values(trees)) {
		tree.levels.sort(order);
		for (const level of tree.levels) {
			level.materials.sort(order);
			for (const material of level.materials) material.lessons.sort(order);
		}
		tree.levelCount = tree.levels.length;
		tree.lessonCount = tree.levels.reduce((sum, level) => sum + level.materials.reduce((n, material) => n + material.lessons.length, 0), 0);
	}
	return { subjects: Object.values(trees).sort(order).map(({ levels: _levels, ...subject }) => subject), trees, lessons };
}

/** Csak a jelenlegi fiók személyes fája adhat teljesítési állapotot. */
export async function readOfflineCatalog(userId?: string): Promise<OfflineCatalog> {
	if (typeof caches === 'undefined') return buildOfflineCatalog([]);
	const names = await caches.keys();
	const documents: LessonDocument[] = [];
	const subjects = new Map<string, Subject>();
	const trees = new Map<string, SubjectTree>();
	for (const name of [CONTENT_CACHE, ...(userId ? [`${PRIVATE_CACHE_PREFIX}${userId}`] : [])]) {
		if (!names.includes(name)) continue;
		const cache = await caches.open(name);
		for (const key of await cache.keys()) {
			const url = new URL(key.url);
			if (url.pathname !== '/api/browse' && !/^\/api\/lessons\/[^/]+$/.test(url.pathname)) continue;
			try {
				const response = await cache.match(key, { ignoreVary: true });
				if (!response?.ok) continue;
				const data = await response.json();
				if (url.pathname.startsWith('/api/lessons/')) {
					if (data.lessonPage?.lesson?.id && data.lessonPage?.subject?.id && data.lessonPage?.level?.id && data.lessonPage?.material?.id) documents.push(data);
				} else {
					for (const subject of data.subjects ?? []) subjects.set(subject.id, subject);
					if (data.tree?.levels && !url.searchParams.has('level')) trees.set(data.tree.id, data.tree);
				}
			} catch { /* Egy sérült bejegyzés miatt a többi lecke még elérhető. */ }
		}
	}
	return buildOfflineCatalog([...new Map(documents.map((document) => [document.lessonPage.lesson.id, document])).values()], [...subjects.values()], [...trees.values()]);
}
