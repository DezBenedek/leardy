import { loadScope, saveScope, type PageScope } from './scope';

const PAGE = 'tanulas-szerkeszto';
const HISTORY_KEY = 'leardy-editor-scopes';
type EditorScope = Pick<PageScope, 'subject' | 'level'>;

function validScope(value: unknown): value is EditorScope {
	if (!value || typeof value !== 'object') return false;
	const scope = value as Partial<EditorScope>;
	return typeof scope.subject === 'string' && !!scope.subject && typeof scope.level === 'string' && !!scope.level;
}

export function loadEditorScopes(): EditorScope[] {
	const last = loadScope(PAGE);
	let history: unknown = [];
	try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); }
	catch { /* Tiltott vagy sérült tároló esetén az utolsó választást használjuk. */ }
	const scopes = [last, ...(Array.isArray(history) ? history : [])].filter(validScope)
		.map(({ subject, level }) => ({ subject, level }));
	return scopes.filter((scope, index) => scopes.findIndex((item) => item.subject === scope.subject && item.level === scope.level) === index).slice(0, 20);
}

/** Csak sikeresen megnyitott, szerkeszthető tananyag kerül az előzmények közé. */
export function rememberEditorScope(subject: string, level: string): void {
	if (!subject || !level) return;
	const recent = loadEditorScopes().filter((scope) => scope.subject !== subject || scope.level !== level);
	saveScope(PAGE, { subject, level });
	try { localStorage.setItem(HISTORY_KEY, JSON.stringify([{ subject, level }, ...recent].slice(0, 20))); }
	catch { /* A szerkesztés tároló nélkül is használható. */ }
}

/** Visszavont jogosultságnál a következő, még szerkeszthető előzményre lépünk. */
export async function findEditableEditorScope(
	scopes: EditorScope[],
	loadLevels: (subject: string) => Promise<{ id: string; canEdit: boolean }[]>,
	isCurrent: () => boolean = () => true
): Promise<EditorScope | null> {
	const trees = new Map<string, { id: string; canEdit: boolean }[]>();
	for (const scope of scopes) {
		if (!isCurrent()) return null;
		let levels = trees.get(scope.subject);
		if (!levels) {
			levels = await loadLevels(scope.subject);
			trees.set(scope.subject, levels);
		}
		if (!isCurrent()) return null;
		if (levels.some((level) => level.id === scope.level && level.canEdit)) return scope;
	}
	return null;
}
