import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Database } from "../db";
import { cardsLocal, decks, idempotencyKeys, subjects, syncCursors } from "../db/schema";
import { nowIso } from "../lib/crypto";
import { jsonError, readJson } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const ENTITIES = ["subject", "deck", "card"] as const;
type EntityKind = (typeof ENTITIES)[number];

type Change = {
	entity: EntityKind;
	clientId: string;
	revision: number;
	payload: Record<string, unknown>;
	deletedAt?: string | null;
};

type PushBody = {
	deviceId?: unknown;
	changes?: unknown;
};

export const syncRoutes = new Hono<AppEnv>();
syncRoutes.use("*", requireAuth);

function asChange(raw: unknown): Change | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Record<string, unknown>;
	if (!ENTITIES.includes(value.entity as EntityKind)) return null;
	if (typeof value.clientId !== "string" || value.clientId.length < 1) return null;
	if (typeof value.revision !== "number" || !Number.isFinite(value.revision)) return null;
	if (!value.payload || typeof value.payload !== "object") return null;
	return {
		entity: value.entity as EntityKind,
		clientId: value.clientId,
		revision: value.revision,
		payload: value.payload as Record<string, unknown>,
		deletedAt: typeof value.deletedAt === "string" ? value.deletedAt : null,
	};
}

function payloadString(payload: Record<string, unknown>, key: string, fallback = ""): string {
	const value = payload[key];
	return typeof value === "string" ? value : fallback;
}

function payloadUpdatedAt(payload: Record<string, unknown>): string {
	const value = payload.updatedAt ?? payload.updated_at;
	return typeof value === "string" && value.length > 0 ? value : nowIso();
}

async function upsertSubject(db: Database, ownerId: string, change: Change) {
	const id = payloadString(change.payload, "id", change.clientId);
	const updatedAt = payloadUpdatedAt(change.payload);
	const existing = await db
		.select()
		.from(subjects)
		.where(and(eq(subjects.ownerId, ownerId), eq(subjects.clientId, change.clientId)))
		.get();
	if (existing && existing.updatedAt >= updatedAt) return "skipped";
	const row = {
		id: existing?.id ?? id,
		ownerId,
		clientId: change.clientId,
		name: payloadString(change.payload, "name", existing?.name ?? "Untitled"),
		revision: change.revision,
		payload: JSON.stringify(change.payload),
		updatedAt,
		deletedAt: change.deletedAt ?? null,
	};
	if (existing) {
		await db.update(subjects).set(row).where(eq(subjects.id, existing.id));
	} else {
		await db.insert(subjects).values(row);
	}
	return "accepted";
}

async function upsertDeck(db: Database, ownerId: string, change: Change) {
	const id = payloadString(change.payload, "id", change.clientId);
	const updatedAt = payloadUpdatedAt(change.payload);
	const existing = await db
		.select()
		.from(decks)
		.where(and(eq(decks.ownerId, ownerId), eq(decks.clientId, change.clientId)))
		.get();
	if (existing && existing.updatedAt >= updatedAt) return "skipped";
	const subjectId = payloadString(change.payload, "subjectId") || payloadString(change.payload, "subject_id") || null;
	const row = {
		id: existing?.id ?? id,
		ownerId,
		subjectId,
		clientId: change.clientId,
		name: payloadString(change.payload, "name", existing?.name ?? "Untitled"),
		revision: change.revision,
		payload: JSON.stringify(change.payload),
		updatedAt,
		deletedAt: change.deletedAt ?? null,
	};
	if (existing) {
		await db.update(decks).set(row).where(eq(decks.id, existing.id));
	} else {
		await db.insert(decks).values(row);
	}
	return "accepted";
}

async function upsertCard(db: Database, ownerId: string, change: Change) {
	const id = payloadString(change.payload, "id", change.clientId);
	const updatedAt = payloadUpdatedAt(change.payload);
	const existing = await db
		.select()
		.from(cardsLocal)
		.where(and(eq(cardsLocal.ownerId, ownerId), eq(cardsLocal.clientId, change.clientId)))
		.get();
	if (existing && existing.updatedAt >= updatedAt) return "skipped";
	const deckId = payloadString(change.payload, "deckId") || payloadString(change.payload, "deck_id") || null;
	const row = {
		id: existing?.id ?? id,
		ownerId,
		deckId,
		clientId: change.clientId,
		front: payloadString(change.payload, "front", existing?.front ?? ""),
		back: payloadString(change.payload, "back", existing?.back ?? ""),
		hint: payloadString(change.payload, "hint") || null,
		example: payloadString(change.payload, "example") || null,
		revision: change.revision,
		payload: JSON.stringify(change.payload),
		updatedAt,
		deletedAt: change.deletedAt ?? null,
	};
	if (existing) {
		await db.update(cardsLocal).set(row).where(eq(cardsLocal.id, existing.id));
	} else {
		await db.insert(cardsLocal).values(row);
	}
	return "accepted";
}

syncRoutes.post("/push", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const idem = c.req.header("Idempotency-Key");
	if (idem) {
		const cached = await db
			.select()
			.from(idempotencyKeys)
			.where(and(eq(idempotencyKeys.key, idem), eq(idempotencyKeys.userId, user.id)))
			.get();
		if (cached) return c.json(JSON.parse(cached.responseJson));
	}

	const body = await readJson<PushBody>(c);
	if (!body || !Array.isArray(body.changes)) return jsonError(c, 400, "changes array is required");
	const deviceId = typeof body.deviceId === "string" ? body.deviceId : null;

	const accepted: Change[] = [];
	const skipped: Change[] = [];
	const rejected: { change: unknown; error: string }[] = [];

	for (const raw of body.changes) {
		const change = asChange(raw);
		if (!change) {
			rejected.push({ change: raw, error: "Invalid change" });
			continue;
		}
		const status =
			change.entity === "subject"
				? await upsertSubject(db, user.id, change)
				: change.entity === "deck"
					? await upsertDeck(db, user.id, change)
					: await upsertCard(db, user.id, change);
		if (status === "accepted") accepted.push(change);
		else skipped.push(change);
	}

	const cursor = nowIso();
	await db
		.insert(syncCursors)
		.values({ userId: user.id, cursor, updatedAt: cursor })
		.onConflictDoUpdate({
			target: syncCursors.userId,
			set: { cursor, updatedAt: cursor },
		});

	const response = { deviceId, cursor, accepted, skipped, rejected };
	if (idem) {
		await db.insert(idempotencyKeys).values({
			key: idem,
			userId: user.id,
			responseJson: JSON.stringify(response),
			createdAt: nowIso(),
		});
	}
	return c.json(response);
});

syncRoutes.get("/pull", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const cursor = c.req.query("cursor") ?? "";

	const subjectRows = cursor
		? await db.select().from(subjects).where(and(eq(subjects.ownerId, user.id), gt(subjects.updatedAt, cursor))).all()
		: await db.select().from(subjects).where(eq(subjects.ownerId, user.id)).all();
	const deckRows = cursor
		? await db.select().from(decks).where(and(eq(decks.ownerId, user.id), gt(decks.updatedAt, cursor))).all()
		: await db.select().from(decks).where(eq(decks.ownerId, user.id)).all();
	const cardRows = cursor
		? await db
				.select()
				.from(cardsLocal)
				.where(and(eq(cardsLocal.ownerId, user.id), gt(cardsLocal.updatedAt, cursor)))
				.all()
		: await db.select().from(cardsLocal).where(eq(cardsLocal.ownerId, user.id)).all();

	const changes = [
		...subjectRows.map((row) => ({
			entity: "subject" as const,
			clientId: row.clientId,
			revision: row.revision,
			payload: row.payload ? JSON.parse(row.payload) : { id: row.id, name: row.name },
			deletedAt: row.deletedAt,
			updatedAt: row.updatedAt,
		})),
		...deckRows.map((row) => ({
			entity: "deck" as const,
			clientId: row.clientId,
			revision: row.revision,
			payload: row.payload ? JSON.parse(row.payload) : { id: row.id, name: row.name, subjectId: row.subjectId },
			deletedAt: row.deletedAt,
			updatedAt: row.updatedAt,
		})),
		...cardRows.map((row) => ({
			entity: "card" as const,
			clientId: row.clientId,
			revision: row.revision,
			payload: row.payload
				? JSON.parse(row.payload)
				: { id: row.id, deckId: row.deckId, front: row.front, back: row.back, hint: row.hint, example: row.example },
			deletedAt: row.deletedAt,
			updatedAt: row.updatedAt,
		})),
	];

	const nextCursor = changes.reduce((max, change) => (change.updatedAt > max ? change.updatedAt : max), cursor || "");
	const updatedAt = nowIso();
	await db
		.insert(syncCursors)
		.values({ userId: user.id, cursor: nextCursor || updatedAt, updatedAt })
		.onConflictDoUpdate({
			target: syncCursors.userId,
			set: { cursor: nextCursor || updatedAt, updatedAt },
		});

	return c.json({ cursor: nextCursor || cursor, changes });
});
