import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

export async function enableForeignKeys(d1: D1Database) {
	await d1.prepare("PRAGMA foreign_keys = ON").run();
}

export type Database = ReturnType<typeof createDb>;
