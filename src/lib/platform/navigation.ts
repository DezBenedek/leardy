import { canViewSchoolStats, hasMinRole, normalizeRole } from '$lib/admin/roles';

export interface NavItem {
	href: string;
	label: string;
	tagline: string;
}

const CORE: NavItem[] = [
	{ href: '/', label: 'Kezdőlap', tagline: 'Napi haladásod' },
	{ href: '/tanulas', label: 'Tanulás', tagline: 'Tantárgyak és leckék' },
	{ href: '/tanterem', label: 'Tanterem', tagline: 'Osztályok és dolgozatok' }
];

const LIBRARY: NavItem = { href: '/kartyak', label: 'Kártyák', tagline: 'Szókártyacsomagok' };

export interface AdminNavItem extends NavItem {
	icon: 'school' | 'shield' | 'code' | 'books';
	minRole: 'school_leader' | 'admin' | 'developer';
}

export const ADMIN_NAV: AdminNavItem[] = [
	{ href: '/admin/iskola', label: 'Iskola', tagline: 'Saját iskola statisztika', icon: 'school', minRole: 'school_leader' },
	{ href: '/admin/moderalas', label: 'Moderálás', tagline: 'Tiltás és némítás', icon: 'shield', minRole: 'admin' },
	{ href: '/admin/tananyag', label: 'Tananyag', tagline: 'Minden lecke szerkesztése', icon: 'books', minRole: 'admin' },
	{ href: '/admin/fejleszto', label: 'Fejlesztő', tagline: 'Szerepek és kulcsok', icon: 'code', minRole: 'developer' }
];

/** Mobil alsó sáv: 3 fő elem plusz Több gomb. A többi a felnyíló menübe kerül.
 *  A Beállítások direkt nincs itt: gépen a profil, telefonon a kezdőlap
 *  fejlécének fogaskereke nyitja. */
export function primaryNav(): NavItem[] {
	return CORE;
}

export function overflowNav(role?: string | null, isAdmin?: number | boolean): NavItem[] {
	const items: NavItem[] = [LIBRARY];
	for (const a of ADMIN_NAV) {
		if (isAdmin && (a.minRole === 'school_leader' || a.minRole === 'admin')) {
			items.push(a);
			continue;
		}
		if (hasMinRole(role, a.minRole)) items.push(a);
	}
	return items;
}

/** Gépi oldalsáv: minden kifér, nincs Több gomb. */
export function sidebarNav(role?: string | null, isAdmin?: number | boolean): NavItem[] {
	return [...CORE, ...overflowNav(role, isAdmin)];
}

/** Régi hívások kompatibilitása: szerep nélkül csak az alap menü. */
export function navFor(role?: string | null, isAdmin?: number | boolean): NavItem[] {
	const r = normalizeRole(role);
	if (r === 'student' && !isAdmin) return [...CORE, LIBRARY];
	return sidebarNav(role, isAdmin);
}

/** Alapértelmezett menü, amit a komponensek a navFor-ral kérnek le. */
export const NAV_ITEMS: NavItem[] = [...CORE, LIBRARY];

/** Fülek sorrendje, ebből jön az oldalátmenet iránya. */
export const TAB_ORDER = [...CORE, LIBRARY].map((item) => item.href);

export function adminNavFor(role?: string | null, isAdmin?: number | boolean): AdminNavItem[] {
	return ADMIN_NAV.filter((a) => {
		if (isAdmin && (a.minRole === 'school_leader' || a.minRole === 'admin')) return true;
		return hasMinRole(role, a.minRole);
	});
}

export function canSeeAdmin(role?: string | null, isAdmin?: number | boolean): boolean {
	return canViewSchoolStats(role, isAdmin);
}

export function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(href + '/');
}
