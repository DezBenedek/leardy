import { DurableObject } from "cloudflare:workers";

type Bucket = { count: number; resetAt: number };

export class RateLimiter extends DurableObject<Env> {
	async consume(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfter?: number }> {
		const now = Date.now();
		const stored = (await this.ctx.storage.get<Bucket>(key)) ?? null;
		if (!stored || stored.resetAt <= now) {
			const resetAt = now + windowMs;
			await this.ctx.storage.put(key, { count: 1, resetAt });
			await this.ctx.storage.setAlarm(resetAt);
			return { ok: true };
		}
		if (stored.count >= limit) {
			return { ok: false, retryAfter: Math.max(1, Math.ceil((stored.resetAt - now) / 1000)) };
		}
		await this.ctx.storage.put(key, { count: stored.count + 1, resetAt: stored.resetAt });
		return { ok: true };
	}

	async alarm(): Promise<void> {
		const now = Date.now();
		const entries = await this.ctx.storage.list<Bucket>();
		for (const [key, bucket] of entries) {
			if (bucket.resetAt <= now) await this.ctx.storage.delete(key);
		}
	}
}
