import { describe, expect, it } from "vitest";
import { hashPassword, PBKDF2_ITERATIONS, verifyPassword } from "../src/lib/password";

describe("password hash/verify", () => {
	it("roundtrips a correct password and rejects a wrong one", async () => {
		const password = "correct-horse-battery";
		const stored = await hashPassword(password);
		expect(stored.startsWith(`pbkdf2$${PBKDF2_ITERATIONS}$`)).toBe(true);
		const parts = stored.split("$");
		expect(parts).toHaveLength(4);
		expect(parts[2]!.length).toBeGreaterThan(0);
		expect(parts[3]!.length).toBeGreaterThan(0);
		expect(await verifyPassword(password, stored)).toBe(true);
		expect(await verifyPassword("wrong-password", stored)).toBe(false);
	});

	it("rejects malformed stored hashes", async () => {
		expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
		expect(await verifyPassword("anything", "pbkdf2$abc$d$e")).toBe(false);
	});
});
