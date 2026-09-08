export interface NavItem {
	href: string;
	label: string;
	tagline: string;
}

export const NAV_ITEMS: NavItem[] = [
	{ href: '/', label: 'Kezdőlap', tagline: 'Áttekintés és folytatás' },
	{ href: '/tanterem', label: 'Tanterem', tagline: 'Osztályok és dolgozatok' },
	{ href: '/temakorok', label: 'Témakörök', tagline: 'Könyvtár és felfedezés' },
	{ href: '/gyakorlas', label: 'Gyakorlás', tagline: 'Napi ismétlések' }
];

/** Fülek sorrendje — az oldalátmenet iránya ebből jön. */
export const TAB_ORDER = NAV_ITEMS.map((item) => item.href);

export function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(href + '/');
}
