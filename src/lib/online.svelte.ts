// Hálózati állapot: offline-ban nincs fetch-próbálkozás, csak mentett adat.
// (Az egyetlen kivétel az élő dolgozat 2,5 mp-es pollingja — az is kihagyja
// a rejtett tabot és a lezárt menetet.)

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
