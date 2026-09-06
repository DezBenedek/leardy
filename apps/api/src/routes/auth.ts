import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { users } from "../db/schema";
import { nowIso, randomId } from "../lib/crypto";
import { DISPLAY_NAME_RE, EMAIL_RE, MAX_PASSWORD_LENGTH, jsonError, readJson } from "../lib/http";
import { hashPassword, verifyPassword } from "../lib/password";
import { createSession, deleteOtherSessions, deleteSessionByToken, toPublicUser, userFromToken } from "../lib/session";
import { extractToken } from "../middleware/auth";
import type { AppEnv } from "../types";

type RegisterBody = {
	name?: unknown;
	username?: unknown;
	email?: unknown;
	password?: unknown;
};

type LoginBody = {
	email?: unknown;
	username?: unknown;
	password?: unknown;
};

type PatchMeBody = {
	email?: unknown;
	name?: unknown;
	currentPassword?: unknown;
	newPassword?: unknown;
	isTeacher?: unknown;
};

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/register", async (c) => {
	const body = await readJson<RegisterBody>(c);
	if (!body) return jsonError(c, 400, "Invalid JSON");
	const name = typeof body.name === "string" ? body.name.trim() : typeof body.username === "string" ? body.username.trim() : "";
	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const password = typeof body.password === "string" ? body.password : "";
	if (!DISPLAY_NAME_RE.test(name)) {
		return jsonError(c, 400, "Name must be 2-64 characters");
	}
	if (!EMAIL_RE.test(email)) return jsonError(c, 400, "Invalid email");
	if (password.length < 8) return jsonError(c, 400, "Password must be at least 8 characters");
	if (password.length > MAX_PASSWORD_LENGTH) return jsonError(c, 400, "Password is too long");

	const db = createDb(c.env.DB);
	const existingEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
	if (existingEmail) return jsonError(c, 409, "Email already taken");
	const existingName = await db.select({ id: users.id }).from(users).where(eq(users.username, name)).get();
	if (existingName) return jsonError(c, 409, "Username already taken");

	const createdAt = nowIso();
	const user = {
		id: randomId(),
		username: name,
		passwordHash: await hashPassword(password),
		email,
		isTeacher: 0,
		createdAt,
	};
	await db.insert(users).values(user);
	const token = await createSession(db, user.id);
	return c.json({ token, user: toPublicUser(user) }, 201);
});

authRoutes.post("/login", async (c) => {
	const body = await readJson<LoginBody>(c);
	if (!body) return jsonError(c, 400, "Invalid JSON");
	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const username = typeof body.username === "string" ? body.username.trim() : "";
	const password = typeof body.password === "string" ? body.password : "";
	if (password.length > MAX_PASSWORD_LENGTH) return jsonError(c, 400, "Password is too long");
	const db = createDb(c.env.DB);
	const row = email
		? await db.select().from(users).where(eq(users.email, email)).get()
		: username
			? await db.select().from(users).where(eq(users.username, username)).get()
			: undefined;
	if (!row || !(await verifyPassword(password, row.passwordHash))) {
		return jsonError(c, 401, "Invalid username or password");
	}
	const token = await createSession(db, row.id);
	return c.json({ token, user: toPublicUser(row) });
});

authRoutes.post("/logout", async (c) => {
	const token = extractToken(c);
	if (!token) return jsonError(c, 401, "Unauthorized");
	const db = createDb(c.env.DB);
	const deleted = await deleteSessionByToken(db, token);
	if (!deleted) return jsonError(c, 401, "Unauthorized");
	return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
	const token = extractToken(c);
	if (!token) return jsonError(c, 401, "Unauthorized");
	const user = await userFromToken(createDb(c.env.DB), token);
	if (!user) return jsonError(c, 401, "Unauthorized");
	return c.json({ user });
});

authRoutes.patch("/me", async (c) => {
	const token = extractToken(c);
	if (!token) return jsonError(c, 401, "Unauthorized");
	const db = createDb(c.env.DB);
	const user = await userFromToken(db, token);
	if (!user) return jsonError(c, 401, "Unauthorized");

	const body = await readJson<PatchMeBody>(c);
	if (!body) return jsonError(c, 400, "Invalid JSON");

	const row = await db.select().from(users).where(eq(users.id, user.id)).get();
	if (!row) return jsonError(c, 401, "Unauthorized");

	let email = row.email;
	if (body.email !== undefined) {
		if (body.email === null || body.email === "") {
			email = null;
		} else if (typeof body.email === "string" && EMAIL_RE.test(body.email.trim())) {
			email = body.email.trim().toLowerCase();
		} else {
			return jsonError(c, 400, "Invalid email");
		}
		if (email) {
			const taken = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
			if (taken && taken.id !== user.id) return jsonError(c, 409, "Email already taken");
		}
	}

	let username = row.username;
	if (body.name !== undefined) {
		if (typeof body.name !== "string" || !DISPLAY_NAME_RE.test(body.name.trim())) {
			return jsonError(c, 400, "Name must be 2-64 characters");
		}
		username = body.name.trim();
		const taken = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
		if (taken && taken.id !== user.id) return jsonError(c, 409, "Username already taken");
	}

	let passwordHash = row.passwordHash;
	if (body.newPassword !== undefined) {
		if (typeof body.newPassword !== "string" || body.newPassword.length < 8) {
			return jsonError(c, 400, "Password must be at least 8 characters");
		}
		if (body.newPassword.length > MAX_PASSWORD_LENGTH) return jsonError(c, 400, "Password is too long");
		const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
		if (!(await verifyPassword(current, row.passwordHash))) {
			return jsonError(c, 401, "Current password is wrong");
		}
		passwordHash = await hashPassword(body.newPassword);
	}

	let isTeacher = row.isTeacher;
	if (body.isTeacher !== undefined) {
		if (typeof body.isTeacher !== "boolean") return jsonError(c, 400, "Invalid teacher flag");
		isTeacher = body.isTeacher ? 1 : 0;
	}

	if (body.email === undefined && body.name === undefined && body.newPassword === undefined && body.isTeacher === undefined) {
		return c.json({ user });
	}

	await db.update(users).set({ email, username, passwordHash, isTeacher }).where(eq(users.id, user.id));
	if (body.newPassword !== undefined) {
		await deleteOtherSessions(db, user.id, token);
	}
	return c.json({ user: toPublicUser({ ...row, email, username, isTeacher }) });
});
