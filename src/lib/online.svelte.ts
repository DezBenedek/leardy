// Hálózati állapot: offline-ban nincs fetch-próbálkozás, csak mentett adat.
// (Nincs se websocket, se polling az appban — az egyetlen időzítő az éles
// dolgozat visszaszámlálója, az is csak a kitöltő overlayben fut.)

import { browser } from '$app/environment';

class OnlineStore {
	online = $state(true);

	constructor() {
		if (!browser) return;
		try {
			this.online = navigator.onLine;
		} catch {
			this.online = true;
		}
		window.addEventListener('online', () => (this.online = true));
		window.addEventListener('offline', () => (this.online = false));
	}
}

export const online = new OnlineStore();
