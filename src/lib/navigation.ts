export interface NavItem {
	href: string;
	label: string;
	tagline: string;
}

export const NAV_ITEMS: NavItem[] = [
	{ href: '/', label: 'Főoldal', tagline: 'Áttekintés és folytatás' },
	{ href: '/leckek', label: 'Leckék', tagline: 'Lépésről lépésre tananyag' },
	{ href: '/szokartyak', label: 'Szókártyák', tagline: 'Villámgyors memorizálás' },
	{ href: '/tanterem', label: 'Tanterem', tagline: 'Élő közös tanulás' }
];

/** Fülek sorrendje — az oldalátmenet iránya ebből jön. */
export const TAB_ORDER = NAV_ITEMS.map((item) => item.href);

export function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(href + '/');
}
