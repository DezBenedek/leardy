import { fromBase64, timingSafeEqual, toBase64 } from "./crypto";

export const PBKDF2_ITERATIONS = 60_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const encoder = new TextEncoder();

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
	const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
		"deriveBits",
	]);
	return crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt: salt as BufferSource,
			iterations,
		},
		material,
		KEY_BITS,
	);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
	const iterations = Number(parts[1]);
	if (!Number.isInteger(iterations) || iterations < 1) return false;
	try {
		const salt = fromBase64(parts[2]!);
		const expected = fromBase64(parts[3]!);
		const actual = new Uint8Array(await deriveBits(password, salt, iterations));
		return timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}
