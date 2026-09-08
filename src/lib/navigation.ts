export interface NavItem {
	href: string;
	label: string;
	tagline: string;
}

const STUDENT_ITEMS: NavItem[] = [
	{ href: '/', label: 'Kezdőlap', tagline: 'Áttekintés és folytatás' },
	{ href: '/tanterem', label: 'Tanterem', tagline: 'Osztályok és dolgozatok' },
	{ href: '/temakorok', label: 'Témakörök', tagline: 'Könyvtár és felfedezés' },
	{ href: '/gyakorlas', label: 'Gyakorlás', tagline: 'Napi ismétlések' }
];

const TEACHER_ITEMS: NavItem[] = [
	{ href: '/', label: 'Kezdőlap', tagline: 'Áttekintés' },
	{ href: '/tanterem', label: 'Tanterem', tagline: 'Osztályok és kiadás' },
	{ href: '/temakorok', label: 'Témakörök', tagline: 'Könyvtár és felfedezés' },
	{ href: '/kvizek', label: 'Kvízek', tagline: 'Saját dolgozatok' },
	{ href: '/kartyak', label: 'Kártyák', tagline: 'Saját kártyacsomagok' }
];

/** Szerep-alapú főmenü: tanárnál nincs Gyakorlás, van Kvízek + Kártyák. */
export function navFor(role?: string | null): NavItem[] {
	return role === 'teacher' ? TEACHER_ITEMS : STUDENT_ITEMS;
}

/** Alapértelmezett (diák) menü — a komponensek a navFor-t használják. */
export const NAV_ITEMS: NavItem[] = STUDENT_ITEMS;

/** Fülek sorrendje — az oldalátmenet iránya ebből jön. */
export const TAB_ORDER = [...STUDENT_ITEMS, ...TEACHER_ITEMS].map((item) => item.href);

export function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(href + '/');
}
