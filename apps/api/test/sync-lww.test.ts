import { describe, expect, it } from "vitest";
import { shouldSkip } from "../src/routes/sync";

describe("sync last-write-wins", () => {
	const existing = { id: "1", updatedAt: "2026-09-02T10:00:00.000Z", revision: 3 };

	it("skips an older updatedAt", () => {
		expect(shouldSkip(existing, "2026-09-02T09:00:00.000Z", 9)).toBe(true);
	});

	it("accepts a newer updatedAt even with a smaller revision", () => {
		expect(shouldSkip(existing, "2026-09-02T11:00:00.000Z", 1)).toBe(false);
	});

	it("uses revision when updatedAt ties", () => {
		expect(shouldSkip(existing, existing.updatedAt, 3)).toBe(true);
		expect(shouldSkip(existing, existing.updatedAt, 2)).toBe(true);
		expect(shouldSkip(existing, existing.updatedAt, 4)).toBe(false);
	});

	it("accepts the first write", () => {
		expect(shouldSkip(undefined, existing.updatedAt, 1)).toBe(false);
	});
});
