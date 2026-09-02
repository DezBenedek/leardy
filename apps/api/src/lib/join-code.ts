import { randomBytes } from "./crypto";

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomJoinCode(length = 6): string {
	const bytes = randomBytes(length);
	let out = "";
	for (const byte of bytes) out += ALPHANUM[byte % ALPHANUM.length];
	return out;
}
