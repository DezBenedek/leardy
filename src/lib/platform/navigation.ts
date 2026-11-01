export interface NavItem {
	href: string;
	label: string;
	tagline: string;
}

const MENU: NavItem[] = [
	{ href: '/', label: 'Kezdőlap', tagline: 'Napi haladásod' },
	{ href: '/tanulas', label: 'Tanulás', tagline: 'Tantárgyak és leckék' },
	{ href: '/tanterem', label: 'Tanterem', tagline: 'Osztályok és dolgozatok' },
	{ href: '/kartyak', label: 'Kártyák', tagline: 'Szókártyacsomagok' }
];

/** Statikus főmenü, ami a szerepet figyelmen kívül hagyja. */
export function navFor(_role?: string | null): NavItem[] {
	return MENU;
}

/** Alapértelmezett menü, amit a komponensek a navFor-ral kérnek le. */
export const NAV_ITEMS: NavItem[] = MENU;

/** Fülek sorrendje, ebből jön az oldalátmenet iránya. */
export const TAB_ORDER = MENU.map((item) => item.href);

export function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(href + '/');
}
