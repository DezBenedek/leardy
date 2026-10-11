import { browser } from '$app/environment';
import { afterNavigate, goto } from '$app/navigation';

interface BackOptions {
	/** A listaoldalon kívül elfogadott belső kiindulópontok. */
	accept?: (url: URL) => boolean;
	/** Mindig a megadott szülőoldalra lép, az előzményektől függetlenül. */
	direct?: boolean;
}

/** Komponens inicializálásakor hívandó. Csak ismert belső előzményre lép vissza. */
export function createBackNavigation(fallback: () => string, options: BackOptions = {}): () => void {
	let previous: URL | null = null;
	let current: string | null = null;

	afterNavigate(({ from, to, type }) => {
		current = to?.url.href ?? null;
		previous = (type === 'link' || type === 'goto') && from?.route.id && to
			&& from.url.origin === to.url.origin && from.url.pathname !== to.url.pathname
			? from.url
			: null;
	});

	return () => {
		if (!browser) return;
		const target = new URL(fallback(), window.location.href);
		if (!options.direct && current === window.location.href && previous
			&& (previous.pathname === target.pathname || options.accept?.(previous))) {
			window.history.back();
			return;
		}
		// A csere megakadályozza, hogy a visszanyíl új navigációs kört hozzon létre.
		void goto(target, { replaceState: true });
	};
}
