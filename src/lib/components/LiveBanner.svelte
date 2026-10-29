<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Card from '$lib/ui/Card.svelte';
	import { Radio } from '@lucide/svelte';

	interface ActiveSession {
		id: string;
		title: string;
		status: string;
		classroom_id?: string;
		classroom_name?: string;
		created_at?: number;
	}

	let active = $state<ActiveSession | null>(null);

	async function check() {
		try {
			const res = await fetch('/api/live/active');
			if (res.status === 401) return;
			const j = await res.json().catch(() => null);
			const list = j && Array.isArray(j.sessions) ? (j.sessions as ActiveSession[]) : [];
			const live = list.find((s) => s.status === 'live') ?? list[0] ?? null;
			active = live && typeof live.id === 'string' ? live : null;
		} catch {
			// csendben: legközelebb újra próbáljuk
		}
	}

	onMount(() => {
		void check();
		const timer = setInterval(check, 15000);
		return () => clearInterval(timer);
	});
</script>

{#if active}
	<div class="anim-rise" style="--d:0ms">
		<Card tone="brand" pad="lg">
			<div class="flex items-center gap-3">
				<span class="relative grid size-11 shrink-0 place-items-center rounded-full bg-white/15" aria-hidden="true">
					<span class="absolute inset-0 animate-ping rounded-full bg-white/20"></span>
					<Radio size={22} class="relative text-white" />
				</span>
				<div class="min-w-0 flex-1">
					<p class="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.14em] text-white/70 uppercase">
						<span class="size-1.5 animate-pulse rounded-full bg-white" aria-hidden="true"></span>
						{active.status === 'live' ? 'Élő dolgozat zajlik' : 'Élő dolgozat indul'}
					</p>
					<p class="font-display truncate text-[18px] font-extrabold tracking-tight text-white">
						{active.classroom_name ?? active.title}
					</p>
				</div>
				<a
					href={resolve('/elo/[id]', { id: active.id })}
					class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-brand-600 shadow-lg transition hover:bg-brand-50 active:scale-[0.99] motion-reduce:transition-none"
				>
					Csatlakozás
				</a>
			</div>
		</Card>
	</div>
{/if}
