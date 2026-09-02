import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { classMembers, quizSessions } from "../db/schema";
import { jsonError } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const quizRoutes = new Hono<AppEnv>();
quizRoutes.use("*", requireAuth);

async function loadMembership(env: Env, sessionId: string, userId: string) {
	const db = createDb(env.DB);
	const session = await db.select().from(quizSessions).where(eq(quizSessions.id, sessionId)).get();
	if (!session) return null;
	const member = await db
		.select()
		.from(classMembers)
		.where(and(eq(classMembers.classId, session.classId), eq(classMembers.userId, userId)))
		.get();
	if (!member) return { session, member: null };
	return { session, member };
}

quizRoutes.get("/:sessionId", async (c) => {
	const user = c.get("user");
	const sessionId = c.req.param("sessionId");
	const loaded = await loadMembership(c.env, sessionId, user.id);
	if (!loaded) return jsonError(c, 404, "Quiz not found");
	if (!loaded.member) return jsonError(c, 403, "Not a member of this class");

	const stub = c.env.QUIZ_SESSION.getByName(sessionId);
	const snapshot = await stub.getSnapshot({ userId: user.id, role: loaded.member.role });
	if (!snapshot) return jsonError(c, 404, "Quiz not found");
	return c.json({ snapshot });
});

quizRoutes.get("/:sessionId/ws", async (c) => {
	if (c.req.header("Upgrade") !== "websocket") {
		return jsonError(c, 426, "Expected WebSocket");
	}
	const user = c.get("user");
	const sessionId = c.req.param("sessionId");
	const loaded = await loadMembership(c.env, sessionId, user.id);
	if (!loaded) return jsonError(c, 404, "Quiz not found");
	if (!loaded.member) return jsonError(c, 403, "Not a member of this class");

	const headers = new Headers(c.req.raw.headers);
	headers.set("X-User-Id", user.id);
	headers.set("X-Role", loaded.member.role);
	headers.set("X-Display-Name", user.username);
	const stub = c.env.QUIZ_SESSION.getByName(sessionId);
	return stub.fetch(new Request(c.req.raw, { headers }));
});
