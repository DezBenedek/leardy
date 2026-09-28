<script lang="ts">
	import { ChevronLeft, ChevronRight, Sparkles } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import SwipePager from '$lib/components/SwipePager.svelte';
	import { CHANGES, LATEST_CHANGE, markWhatsNewSeen } from '$lib/changelog';

	/* Újdonság-drawer: a changelog-bejegyzések között jobbra-balra
	   legyintve (vagy a nyilakkal, pöttyökkel) lehet váltani.
	   A SwipePager az előző és a következő oldalt is előre betölti,
	   húzás közben pedig már tolódik a tartalom. */

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();

	let idx = $state(0);
	let entry = $derived(CHANGES[Math.min(idx, CHANGES.length - 1)] ?? LATEST_CHANGE);

	function go(i: number) {
		idx = Math.max(0, Math.min(CHANGES.length - 1, i));
	}

	function prev() {
		go(idx - 1);
	}

	function next() {
		go(idx + 1);
	}

	function close() {
		markWhatsNewSeen(LATEST_CHANGE.version);
		idx = 0;
		onClose();
	}
</script>

<Drawer open={open} label={`Frissítés ${entry.version}`} title={`Frissítés - ${entry.version}`} onClose={close}>
	<div class="mt-3">
		<SwipePager count={CHANGES.length} index={idx} onIndex={go}>
			{#snippet page(i)}
				{@const e = CHANGES[i] ?? LATEST_CHANGE}
				<div role="region" aria-label={`Újdonságok - ${e.version}`}>
					<div class="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 dark:bg-brand-500/15">
						<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-white">
							<Sparkles size={22} />
						</span>
						<p class="text-[16px] font-extrabold tracking-tight text-ink-900 dark:text-white">
							{e.title}
						</p>
					</div>
					<ul class="mt-2 divide-y divide-stone-100 dark:divide-white/5">
						{#each e.items as item (item.title)}
							<li class="flex gap-3 py-3">
								<span class="mt-[7px] size-2 shrink-0 rounded-full bg-brand-500"></span>
								<div class="min-w-0">
									<p class="text-[15px] font-bold text-ink-900 dark:text-white">{item.title}</p>
									<p class="mt-0.5 text-[13px] leading-relaxed text-ink-400 dark:text-stone-500">
										{item.desc}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/snippet}
		</SwipePager>
		{#if CHANGES.length > 1}
			<div class="mt-1 flex items-center justify-between gap-2 pb-1">
				<button
					type="button"
					onclick={prev}
					disabled={idx === 0}
					aria-label="Előző újdonság"
					class="grid size-9 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 active:scale-95 disabled:opacity-30 dark:text-stone-400 dark:hover:bg-white/10"
				>
					<ChevronLeft size={20} />
				</button>
				<div class="flex items-center gap-1.5" role="tablist" aria-label="Újdonságok">
					{#each CHANGES as c, i (c.version)}
						<button
							type="button"
							role="tab"
							aria-selected={i === idx}
							aria-label={c.version}
							onclick={() => go(i)}
							class={[
								'h-2 rounded-full transition-all',
								i === idx ? 'w-5 bg-brand-500' : 'w-2 bg-stone-300 dark:bg-white/20'
							]}
						></button>
					{/each}
				</div>
				<button
					type="button"
					onclick={next}
					disabled={idx === CHANGES.length - 1}
					aria-label="Következő újdonság"
					class="grid size-9 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 active:scale-95 disabled:opacity-30 dark:text-stone-400 dark:hover:bg-white/10"
				>
					<ChevronRight size={20} />
				</button>
			</div>
		{/if}
	</div>
</Drawer>
