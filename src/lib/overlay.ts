import { browser } from '$app/environment';

/* Kozos overlay-seged a felnyilo retegekhez (Drawer, Sheet, QuizModal,
   ConfirmDialog, MediaPermissionHelp, kepszerkeszto, hangrogzito).
   Ket dolgot old meg, ami gyors kattintasnal oldal-szintu fagyast okozott:
   1. Referencia-samlalt body-zar: egymasra nyilo vagy kozel egyszerre
      zarodo retegek nem tudjak egymast koran feloldva beragasztani
      (vagy vegleg zarnak hagyni) a hatter-gorgetest. Csak az utolso
      feloldo allitja vissza az eredeti erteket.
   2. Kozos mozgas-kapcsolo: az app Mozgas-csokkentoje es az OS kerese
      egy helyen dol el, igy nem sodrodik szet a komponensek kozott. */

let locks = 0;
let saved = '';

export function lockBody(): () => void {
	if (!browser) return () => {};
	if (locks === 0) {
		saved = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
	}
	locks += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		locks = Math.max(0, locks - 1);
		if (locks === 0 && browser) {
			document.body.style.overflow = saved;
		}
	};
}

export function motionOK(): boolean {
	if (!browser) return false;
	try {
		if (document.documentElement.classList.contains('reduce-motion')) return false;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
	} catch {
		return true;
	}
	return true;
}
