import { json, type RequestHandler } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { ApiAuth } from '$lib/server/auth/api-keys';
import type { PublicUser } from '$lib/server/infra/db';

export type RouteCtx = {
	event: Parameters<RequestHandler>[0];
	db: D1Database;
	a: ApiAuth;
	user: PublicUser;
	method: string;
	url: URL;
	segments: string[];
	head: string | undefined;
	second: string | undefined;
	third: string | undefined;
};

export const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'access-control-allow-headers': 'authorization, x-api-key, content-type',
	'access-control-max-age': '86400'
};

export const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', ...CORS, 'cache-control': 'no-store' };

export function ok(data: Record<string, unknown>, status = 200) {
	return json(data, { status, headers: JSON_HEADERS });
}

export function err(message: string, status = 400) {
	return json({ error: message }, { status, headers: JSON_HEADERS });
}

export function newId(prefix: string): string {
	const r = Math.random().toString(36).slice(2, 10);
	return `${prefix}-${Date.now().toString(36)}-${r}`;
}

export function intParam(url: URL, name: string, fallback: number, max: number): number {
	const raw = url.searchParams.get(name);
	if (raw === null) return fallback;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(0, Math.min(max, n));
}

export function strParam(url: URL, name: string): string {
	return (url.searchParams.get(name) ?? '').trim();
}

export async function readJson(event: Parameters<RequestHandler>[0]): Promise<Record<string, unknown>> {
	try {
		const body = await event.request.json();
		if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
		return {};
	} catch {
		return {};
	}
}
