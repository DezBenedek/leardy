import type { Context, Next } from "hono";
import { createDb } from "../db";
import { jsonError, parseBearer } from "../lib/http";
import { userFromToken } from "../lib/session";
import type { AppEnv } from "../types";

export function extractToken(c: Context): string | null {
	return parseBearer(c.req.header("Authorization")) ?? c.req.query("token") ?? null;
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
	const token = extractToken(c);
	if (!token) return jsonError(c, 401, "Unauthorized");
	const user = await userFromToken(createDb(c.env.DB), token);
	if (!user) return jsonError(c, 401, "Unauthorized");
	c.set("user", user);
	await next();
}
