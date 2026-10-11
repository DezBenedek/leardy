import type { Package } from './curriculum';

/** A mentett könyvtár offline nem jár le; online mindig a szerver az igazság. */
export function readOfflineLibrary(owner: string): Package[] | null {
	try {
		const stored = JSON.parse(localStorage.getItem(`leardy-library:${owner}`) ?? 'null');
		return Array.isArray(stored?.packages) ? stored.packages : null;
	} catch { return null; }
}

export function writeOfflineLibrary(owner: string, packages: Package[]): void {
	localStorage.setItem(`leardy-library:${owner}`, JSON.stringify({ at: Date.now(), packages }));
}

export function offlineLibraryResponse(url: URL, owner: string): Response | undefined {
	const packages = readOfflineLibrary(owner);
	if (!packages) return;
	let data: unknown;
	if (url.pathname === '/api/library') {
		data = url.searchParams.get('ids') === '1' ? { ids: packages.map((pkg) => pkg.quizId) } : { packages };
	} else if (url.pathname === '/api/packages') {
		const id = url.searchParams.get('id');
		const attached = url.searchParams.get('attachedTo');
		if (id) {
			const pkg = packages.find((pkg) => pkg.quizId === id);
			if (!pkg) return;
			data = { package: pkg, progress: {} };
		} else if (attached) data = { packages: packages.filter((pkg) => pkg.attachedLessonId === attached || pkg.attachedLessonIds?.includes(attached) || pkg.attachedLessons?.some((lesson) => lesson.id === attached)) };
		else return;
	} else return;
	return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-content-offline': 'true', 'x-content-owner': owner } });
}
