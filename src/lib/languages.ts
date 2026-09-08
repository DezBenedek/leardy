export type LangCode = 'en' | 'de' | 'it' | 'es';

export interface LangDef {
	code: LangCode;
	/** Magyar név */
	name: string;
	/** Rövid kód a választóba */
	short: string;
}

export const LANGUAGES: LangDef[] = [
	{ code: 'en', name: 'Angol', short: 'EN' },
	{ code: 'de', name: 'Német', short: 'DE' },
	{ code: 'it', name: 'Olasz', short: 'IT' },
	{ code: 'es', name: 'Spanyol', short: 'ES' }
];
