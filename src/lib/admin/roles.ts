// Admin szerepmodell: egyetlen forras az egesz appban.
// Hierarchia: developer > admin > school_leader > teacher > student.
// Diak es tanar automatikus e-mail alapjan, a tobbit fejlesztő osztja.

export const ROLES = ['student', 'teacher', 'school_leader', 'admin', 'developer'] as const;

export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = {
	student: 0,
	teacher: 10,
	school_leader: 20,
	admin: 30,
	developer: 40
};

export function normalizeRole(raw: unknown): Role {
	return ROLES.includes(raw as Role) ? (raw as Role) : 'student';
}

export function roleRank(role: unknown): number {
	return RANK[normalizeRole(role)] ?? 0;
}

/** Legalabb az elvart szint? Pl. hasMinRole(user.role, 'admin'). */
export function hasMinRole(role: unknown, min: Role): boolean {
	return roleRank(role) >= RANK[min];
}

export function isPrivileged(role: unknown): boolean {
	return hasMinRole(role, 'school_leader');
}

export function canTeach(role: unknown, isAdmin?: number | boolean): boolean {
	if (isAdmin) return true;
	const r = normalizeRole(role);
	return r === 'teacher' || r === 'school_leader' || r === 'admin' || r === 'developer';
}

export function canEditAllLessons(role: unknown, isAdmin?: number | boolean): boolean {
	if (isAdmin) return true;
	return hasMinRole(role, 'admin');
}

export function canModerate(role: unknown, isAdmin?: number | boolean): boolean {
	if (isAdmin) return true;
	return hasMinRole(role, 'admin');
}

export function canViewSchoolStats(role: unknown, isAdmin?: number | boolean): boolean {
	if (isAdmin) return true;
	return hasMinRole(role, 'school_leader');
}

export function canAssignRoles(role: unknown): boolean {
	return normalizeRole(role) === 'developer';
}

export function canUseApiKeys(role: unknown, isAdmin?: number | boolean): boolean {
	if (isAdmin) return true;
	const r = normalizeRole(role);
	return r === 'teacher' || r === 'school_leader' || r === 'admin' || r === 'developer';
}

export const ROLE_LABEL: Record<Role, string> = {
	student: 'Diák',
	teacher: 'Tanár',
	school_leader: 'Iskola vezető',
	admin: 'Admin',
	developer: 'Fejlesztő'
};

export function roleLabel(role: unknown): string {
	return ROLE_LABEL[normalizeRole(role)];
}
