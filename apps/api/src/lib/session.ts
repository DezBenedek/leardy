import { and, eq, ne } from "drizzle-orm";
import { sessions, users } from "../db/schema";
import type { Database } from "../db";
import type { AuthUser } from "../types";
import { nowIso, randomId, randomToken, sha256Hex } from "./crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function toPublicUser(row: {
	id: string;
	username: string;
	email: string | null;
	createdAt: string;
	isTeacher?: number | boolean | null;
}): AuthUser {
	return {
		id: row.id,
		username: row.username,
		email: row.email,
		createdAt: row.createdAt,
		isTeacher: row.isTeacher === true || row.isTeacher === 1,
	};
}

export async function createSession(db: Database, userId: string): Promise<string> {
	const token = randomToken(32);
	const tokenHash = await sha256Hex(token);
	const createdAt = nowIso();
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
	await db.insert(sessions).values({
		id: randomId(),
		userId,
		tokenHash,
		createdAt,
		expiresAt,
	});
	return token;
}

export async function userFromToken(db: Database, token: string): Promise<AuthUser | null> {
	const tokenHash = await sha256Hex(token);
	const row = await db
		.select({
			sessionId: sessions.id,
			expiresAt: sessions.expiresAt,
			id: users.id,
			username: users.username,
			email: users.email,
			isTeacher: users.isTeacher,
			createdAt: users.createdAt,
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.tokenHash, tokenHash))
		.get();
	if (!row) return null;
	if (new Date(row.expiresAt).getTime() <= Date.now()) {
		await db.delete(sessions).where(eq(sessions.id, row.sessionId));
		return null;
	}
	return toPublicUser(row);
}

export async function deleteSessionByToken(db: Database, token: string): Promise<boolean> {
	const tokenHash = await sha256Hex(token);
	const deleted = await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).returning({
		id: sessions.id,
	});
	return deleted.length > 0;
}

export async function deleteOtherSessions(db: Database, userId: string, keepToken: string): Promise<void> {
	const keepHash = await sha256Hex(keepToken);
	await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.tokenHash, keepHash)));
}
