/** Frissítés látható alkalmazásnál, időzített lekérdezés és automatikus újratöltés nélkül. */
export function startPwaUpdates(): () => void {
	if (!navigator.serviceWorker) return () => {};
	let registration: ServiceWorkerRegistration | undefined;
	let stopped = false;
	let updating = false;
	let checkedAt = Date.now();
	const check = () => {
		if (!registration || stopped || updating || document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - checkedAt < 60_000) return;
		checkedAt = Date.now();
		updating = true;
		void registration.update().catch(() => undefined).finally(() => { updating = false; });
	};
	// A register már ellenőrzi a kiadást; utána nem kérjük le rögtön másodszor.
	void navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
		.then((value) => { if (!stopped) registration = value; })
		.catch((error: unknown) => { console.warn('PWA-regisztrációs hiba', error); });
	document.addEventListener('visibilitychange', check);
	window.addEventListener('online', check);
	return () => {
		stopped = true;
		document.removeEventListener('visibilitychange', check);
		window.removeEventListener('online', check);
	};
}
