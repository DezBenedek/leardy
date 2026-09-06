import type { Context, Next } from "hono";
import { createDb } from "../db";
import { jsonError, parseBearer } from "../lib/http";
import { userFromToken } from "../lib/session";
import type { AppEnv } from "../types";

export function extractToken(c: Context, options?: { allowQuery?: boolean }): string | null {
	const header = parseBearer(c.req.header("Authorization"));
	if (header) return header;
	if (options?.allowQuery) return c.req.query("token") ?? null;
	return null;
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
	const allowQuery = c.req.path.includes("/ws");
	const token = extractToken(c, { allowQuery });
	if (!token) return jsonError(c, 401, "Unauthorized");
	const user = await userFromToken(createDb(c.env.DB), token);
	if (!user) return jsonError(c, 401, "Unauthorized");
	c.set("user", user);
	await next();
}
