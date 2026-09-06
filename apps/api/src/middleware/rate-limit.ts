import type { Context, Next } from "hono";
import { jsonError } from "../lib/http";

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 120;
const AUTH_LIMIT = 30;
const JOIN_LIMIT = 10;

function clientIp(c: Context): string {
	return c.req.header("CF-Connecting-IP") ?? "unknown";
}

function limitFor(path: string): number {
	if (path.startsWith("/auth/register") || path.startsWith("/auth/login")) return AUTH_LIMIT;
	if (path === "/classes/join") return JOIN_LIMIT;
	return DEFAULT_LIMIT;
}

export async function rateLimit(c: Context<{ Bindings: Env }>, next: Next) {
	const path = new URL(c.req.url).pathname;
	const limit = limitFor(path);
	const stub = c.env.RATE_LIMITER.getByName(clientIp(c));
	const result = await stub.consume(`${c.req.method}:${path}`, limit, WINDOW_MS);
	if (!result.ok) {
		if (result.retryAfter) c.header("Retry-After", String(result.retryAfter));
		return jsonError(c, 429, "Too many requests");
	}
	await next();
}
