import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { cards, sets } from "../db/schema";
import { nowIso, randomId } from "./crypto";
import { insertInChunks } from "./d1";

export type CardDraft = {
	front: string;
	back: string;
	hint: string | null;
	example: string | null;
};

function cardRows(setId: string, drafts: CardDraft[], updatedAt: string) {
	return drafts.map((card, index) => ({
		id: randomId(),
		setId,
		front: card.front,
		back: card.back,
		hint: card.hint,
		example: card.example,
		sortOrder: index,
		updatedAt,
		revision: 1,
		clientId: randomId(),
	}));
}

export async function createSetWithCards(
	db: Database,
	args: {
		id?: string;
		ownerId: string;
		classId: string | null;
		name: string;
		subject: string;
		cards: CardDraft[];
	},
) {
	const createdAt = nowIso();
	const setId = args.id ?? randomId();
	await db.insert(sets).values({
		id: setId,
		ownerId: args.ownerId,
		classId: args.classId,
		name: args.name,
		subject: args.subject,
		visibility: "classroom",
		createdAt,
		updatedAt: createdAt,
		deletedAt: null,
		revision: 1,
		clientId: randomId(),
	});
	const rows = cardRows(setId, args.cards, createdAt);
	if (rows.length > 0) {
		try {
			await insertInChunks(rows, 10, (chunk) => db.insert(cards).values(chunk));
		} catch (error) {
			await db.delete(sets).where(eq(sets.id, setId));
			throw error;
		}
	}
	return { setId, createdAt, cards: rows };
}

export async function replaceSetCards(db: Database, setId: string, drafts: CardDraft[]) {
	const updatedAt = nowIso();
	await db.delete(cards).where(eq(cards.setId, setId));
	const rows = cardRows(setId, drafts, updatedAt);
	if (rows.length > 0) {
		await insertInChunks(rows, 10, (chunk) => db.insert(cards).values(chunk));
	}
	await db.update(sets).set({ updatedAt }).where(eq(sets.id, setId));
	return { setId, updatedAt, cards: rows };
}
