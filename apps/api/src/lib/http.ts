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

export function isLocalhostOrigin(origin: string): boolean {
	try {
		const url = new URL(origin);
		return url.hostname === "localhost" || url.hostname === "127.0.0.1";
	} catch {
		return false;
	}
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
