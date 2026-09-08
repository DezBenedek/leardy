// App-verzió és build-idő. A build-időt a vite.config.ts szúrja be
// (__APP_BUILD_TIME__), így az "utolsó frissítés" mindig a tényleges buildet mutatja.
import { version } from '../../package.json';

declare const __APP_BUILD_TIME__: string;

export const APP_VERSION: string = version;

export function appBuildDate(): Date {
	try {
		const d = new Date(__APP_BUILD_TIME__);
		if (!Number.isNaN(d.getTime())) return d;
	} catch {
		// leesünk az aktuális dátumra
	}
	return new Date();
}

export function appBuildLabel(): string {
	try {
		return appBuildDate().toLocaleString('hu-HU', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	} catch {
		return '';
	}
}
