import type { Context, Next } from "hono";
import { jsonError } from "../lib/http";

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 120;
const AUTH_LIMIT = 30;
const buckets = new Map<string, Bucket>();

function clientIp(c: Context): string {
	return c.req.header("CF-Connecting-IP") ?? c.req.header("x-forwarded-for") ?? "local";
}

function limitFor(path: string): number {
	if (path.startsWith("/auth/register") || path.startsWith("/auth/login")) return AUTH_LIMIT;
	return DEFAULT_LIMIT;
}

export async function rateLimit(c: Context, next: Next) {
	const key = `${clientIp(c)}:${c.req.method}:${new URL(c.req.url).pathname}`;
	const now = Date.now();
	const limit = limitFor(new URL(c.req.url).pathname);
	const existing = buckets.get(key);
	if (!existing || existing.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
		await next();
		return;
	}
	existing.count += 1;
	if (existing.count > limit) {
		return jsonError(c, 429, "Too many requests");
	}
	await next();
}
