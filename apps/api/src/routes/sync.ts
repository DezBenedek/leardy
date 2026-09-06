import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Database } from "../db";
import {
	cardSchedulesRemote,
	cardsLocal,
	dailyActivitiesRemote,
	decks,
	idempotencyKeys,
	reviewLogs,
	subjects,
	syncCursors,
} from "../db/schema";
import { nowIso } from "../lib/crypto";
import { jsonError, readJson, safeJsonParse } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const ENTITIES = ["subject", "deck", "card", "cardSchedule", "reviewLog", "dailyActivity"] as const;
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

type SyncRow = { id: string; updatedAt: string; revision: number };

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

function payloadNumber(payload: Record<string, unknown>, key: string, fallback = 0): number {
	const value = payload[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function payloadUpdatedAt(payload: Record<string, unknown>): string {
	const value = payload.updatedAt ?? payload.updated_at;
	return typeof value === "string" && value.length > 0 ? value : nowIso();
}

export function shouldSkip(existing: SyncRow | undefined, updatedAt: string, revision: number) {
	if (!existing) return false;
	if (existing.updatedAt > updatedAt) return true;
	if (existing.updatedAt === updatedAt && existing.revision >= revision) return true;
	return false;
}

function parsePayload(raw: string | null | undefined, fallback: Record<string, unknown>) {
	const parsed = safeJsonParse(raw, fallback);
	return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : fallback;
}

async function upsertSubject(db: Database, ownerId: string, change: Change) {
	const id = payloadString(change.payload, "id", change.clientId);
	const updatedAt = payloadUpdatedAt(change.payload);
	const existing = await db
		.select()
		.from(subjects)
		.where(and(eq(subjects.ownerId, ownerId), eq(subjects.clientId, change.clientId)))
		.get();
	if (shouldSkip(existing, updatedAt, change.revision)) return "skipped";
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
	if (existing) await db.update(subjects).set(row).where(eq(subjects.id, existing.id));
	else await db.insert(subjects).values(row);
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
	if (shouldSkip(existing, updatedAt, change.revision)) return "skipped";
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
	if (existing) await db.update(decks).set(row).where(eq(decks.id, existing.id));
	else await db.insert(decks).values(row);
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
	if (shouldSkip(existing, updatedAt, change.revision)) return "skipped";
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
	if (existing) await db.update(cardsLocal).set(row).where(eq(cardsLocal.id, existing.id));
	else await db.insert(cardsLocal).values(row);
	return "accepted";
}

async function upsertSchedule(db: Database, ownerId: string, change: Change) {
	const id = payloadString(change.payload, "id", change.clientId);
	const updatedAt = payloadUpdatedAt(change.payload);
	const existing = await db
		.select()
		.from(cardSchedulesRemote)
		.where(and(eq(cardSchedulesRemote.ownerId, ownerId), eq(cardSchedulesRemote.clientId, change.clientId)))
		.get();
	if (shouldSkip(existing, updatedAt, change.revision)) return "skipped";
	const row = {
		id: existing?.id ?? id,
		ownerId,
		clientId: change.clientId,
		cardId: payloadString(change.payload, "cardId", existing?.cardId ?? ""),
		dueAt: payloadString(change.payload, "dueAt", existing?.dueAt ?? updatedAt),
		payload: JSON.stringify(change.payload),
		revision: change.revision,
		updatedAt,
		deletedAt: change.deletedAt ?? null,
	};
	if (existing) await db.update(cardSchedulesRemote).set(row).where(eq(cardSchedulesRemote.id, existing.id));
	else await db.insert(cardSchedulesRemote).values(row);
	return "accepted";
}

async function upsertReview(db: Database, ownerId: string, change: Change) {
	const id = payloadString(change.payload, "id", change.clientId);
	const updatedAt = payloadUpdatedAt(change.payload);
	const existing = await db
		.select()
		.from(reviewLogs)
		.where(and(eq(reviewLogs.ownerId, ownerId), eq(reviewLogs.clientId, change.clientId)))
		.get();
	if (shouldSkip(existing, updatedAt, change.revision)) return "skipped";
	const row = {
		id: existing?.id ?? id,
		ownerId,
		clientId: change.clientId,
		cardId: payloadString(change.payload, "cardId", existing?.cardId ?? ""),
		payload: JSON.stringify(change.payload),
		revision: change.revision,
		updatedAt,
		deletedAt: change.deletedAt ?? null,
	};
	if (existing) await db.update(reviewLogs).set(row).where(eq(reviewLogs.id, existing.id));
	else await db.insert(reviewLogs).values(row);
	return "accepted";
}

async function upsertDaily(db: Database, ownerId: string, change: Change) {
	const id = payloadString(change.payload, "id", change.clientId);
	const updatedAt = payloadUpdatedAt(change.payload);
	const existing = await db
		.select()
		.from(dailyActivitiesRemote)
		.where(and(eq(dailyActivitiesRemote.ownerId, ownerId), eq(dailyActivitiesRemote.clientId, change.clientId)))
		.get();
	if (shouldSkip(existing, updatedAt, change.revision)) return "skipped";
	const row = {
		id: existing?.id ?? id,
		ownerId,
		clientId: change.clientId,
		date: payloadString(change.payload, "date", existing?.date ?? ""),
		cardsReviewed: payloadNumber(change.payload, "cardsReviewed", existing?.cardsReviewed ?? 0),
		payload: JSON.stringify(change.payload),
		revision: change.revision,
		updatedAt,
		deletedAt: change.deletedAt ?? null,
	};
	if (existing) await db.update(dailyActivitiesRemote).set(row).where(eq(dailyActivitiesRemote.id, existing.id));
	else await db.insert(dailyActivitiesRemote).values(row);
	return "accepted";
}

async function applyChange(db: Database, ownerId: string, change: Change) {
	switch (change.entity) {
		case "subject":
			return upsertSubject(db, ownerId, change);
		case "deck":
			return upsertDeck(db, ownerId, change);
		case "card":
			return upsertCard(db, ownerId, change);
		case "cardSchedule":
			return upsertSchedule(db, ownerId, change);
		case "reviewLog":
			return upsertReview(db, ownerId, change);
		case "dailyActivity":
			return upsertDaily(db, ownerId, change);
	}
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
		if (cached) {
			const parsed = safeJsonParse(cached.responseJson, null);
			if (parsed && typeof parsed === "object") return c.json(parsed);
		}
	}

	const body = await readJson<PushBody>(c);
	if (!body || !Array.isArray(body.changes)) return jsonError(c, 400, "changes array is required");
	const deviceId = typeof body.deviceId === "string" ? body.deviceId : null;

	const accepted: Change[] = [];
	const skipped: Change[] = [];
	const rejected: { change: unknown; error: string }[] = [];

	try {
		for (const raw of body.changes) {
			const change = asChange(raw);
			if (!change) {
				rejected.push({ change: raw, error: "Invalid change" });
				continue;
			}
			const status = await applyChange(db, user.id, change);
			if (status === "accepted") accepted.push(change);
			else skipped.push(change);
		}
	} catch (error) {
		console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "sync push failed" }));
		return jsonError(c, 500, "Could not save changes");
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
		await db
			.insert(idempotencyKeys)
			.values({
				key: idem,
				userId: user.id,
				responseJson: JSON.stringify(response),
				createdAt: nowIso(),
			})
			.onConflictDoUpdate({
				target: idempotencyKeys.key,
				set: { responseJson: JSON.stringify(response), createdAt: nowIso(), userId: user.id },
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
	const scheduleRows = cursor
		? await db
				.select()
				.from(cardSchedulesRemote)
				.where(and(eq(cardSchedulesRemote.ownerId, user.id), gt(cardSchedulesRemote.updatedAt, cursor)))
				.all()
		: await db.select().from(cardSchedulesRemote).where(eq(cardSchedulesRemote.ownerId, user.id)).all();
	const reviewRows = cursor
		? await db.select().from(reviewLogs).where(and(eq(reviewLogs.ownerId, user.id), gt(reviewLogs.updatedAt, cursor))).all()
		: await db.select().from(reviewLogs).where(eq(reviewLogs.ownerId, user.id)).all();
	const dailyRows = cursor
		? await db
				.select()
				.from(dailyActivitiesRemote)
				.where(and(eq(dailyActivitiesRemote.ownerId, user.id), gt(dailyActivitiesRemote.updatedAt, cursor)))
				.all()
		: await db.select().from(dailyActivitiesRemote).where(eq(dailyActivitiesRemote.ownerId, user.id)).all();

	const changes = [
		...subjectRows.map((row) => ({
			entity: "subject" as const,
			clientId: row.clientId,
			revision: row.revision,
			payload: parsePayload(row.payload, { id: row.id, name: row.name }),
			deletedAt: row.deletedAt,
			updatedAt: row.updatedAt,
		})),
		...deckRows.map((row) => ({
			entity: "deck" as const,
			clientId: row.clientId,
			revision: row.revision,
			payload: parsePayload(row.payload, { id: row.id, name: row.name, subjectId: row.subjectId }),
			deletedAt: row.deletedAt,
			updatedAt: row.updatedAt,
		})),
		...cardRows.map((row) => ({
			entity: "card" as const,
			clientId: row.clientId,
			revision: row.revision,
			payload: parsePayload(row.payload, {
				id: row.id,
				deckId: row.deckId,
				front: row.front,
				back: row.back,
				hint: row.hint,
				example: row.example,
			}),
			deletedAt: row.deletedAt,
			updatedAt: row.updatedAt,
		})),
		...scheduleRows.map((row) => ({
			entity: "cardSchedule" as const,
			clientId: row.clientId,
			revision: row.revision,
			payload: parsePayload(row.payload, { id: row.id, cardId: row.cardId, dueAt: row.dueAt }),
			deletedAt: row.deletedAt,
			updatedAt: row.updatedAt,
		})),
		...reviewRows.map((row) => ({
			entity: "reviewLog" as const,
			clientId: row.clientId,
			revision: row.revision,
			payload: parsePayload(row.payload, { id: row.id, cardId: row.cardId }),
			deletedAt: row.deletedAt,
			updatedAt: row.updatedAt,
		})),
		...dailyRows.map((row) => ({
			entity: "dailyActivity" as const,
			clientId: row.clientId,
			revision: row.revision,
			payload: parsePayload(row.payload, { id: row.id, date: row.date, cardsReviewed: row.cardsReviewed }),
			deletedAt: row.deletedAt,
			updatedAt: row.updatedAt,
		})),
	];

	const nextCursor = changes.reduce((max, change) => (change.updatedAt > max ? change.updatedAt : max), cursor || "");
	return c.json({ cursor: nextCursor || cursor, changes });
});
