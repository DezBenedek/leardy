import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function jsonError(c: Context, status: ContentfulStatusCode, error: string) {
	return c.json({ error }, status);
}

export async function readJson<T>(c: Context): Promise<T | null> {
	try {
		return (await c.req.json()) as T;
	} catch {
		return null;
	}
}

export const MAX_PASSWORD_LENGTH = 128;

export function safeJsonParse(raw: string | null | undefined, fallback: unknown = {}): unknown {
	try {
		return JSON.parse(raw || "null") ?? fallback;
	} catch {
		return fallback;
	}
}

export function isLocalhostOrigin(origin: string): boolean {
	try {
		const url = new URL(origin);
		return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
	} catch {
		return false;
	}
}

export function allowedCorsOrigin(origin: string | undefined): string {
	if (!origin) return "*";
	if (isLocalhostOrigin(origin)) return origin;
	try {
		const host = new URL(origin).hostname;
		if (host === "leardy.app" || host.endsWith(".leardy.app")) return origin;
	} catch {
		return "";
	}
	return "";
}

export const USERNAME_RE = /^[\p{L}\p{N}._-]{3,32}$/u;
export const DISPLAY_NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,63}$/u;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseBearer(header: string | undefined): string | null {
	if (!header) return null;
	const [scheme, token] = header.split(" ");
	if (scheme?.toLowerCase() !== "bearer" || !token) return null;
	return token;
}
