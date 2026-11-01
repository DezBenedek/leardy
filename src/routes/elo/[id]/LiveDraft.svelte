<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';

	interface Props {
		title: string;
		questionsCount: number;
		playMode: 'solo' | 'stage';
		pacing: 'self' | 'synced';
		teacher: boolean;
		busy: boolean;
		onPublish: () => void;
	}

	let { title, questionsCount, playMode, pacing, teacher, busy, onPublish }: Props = $props();
</script>

<div class="mt-4 grid gap-2.5">
	<Card tone="brand">
		<div class="anim-rise flex flex-col items-center py-4 text-center" style="--d:0ms">
			<p class="text-[11px] font-extrabold tracking-[0.14em] text-white/70 uppercase">Piszkozat</p>
			<h2 class="font-display mt-1 text-[22px] font-extrabold tracking-tight text-white">{title}</h2>
			<p class="mt-1 text-[13px] font-semibold text-white/80 tabular-nums">
				{questionsCount} kérdés · {playMode === 'stage' ? 'Tantermi' : pacing === 'synced' ? 'Együtt' : 'Saját tempó'}
			</p>
		</div>
	</Card>
	{#if teacher}
		<div class="anim-rise" style="--d:60ms">
			<Button size="lg" block disabled={busy} onclick={onPublish}>Meghirdetés</Button>
		</div>
	{:else}
		<div class="anim-rise" style="--d:60ms">
			<Card>
				<p class="text-center text-[14px] font-bold text-ink-900 dark:text-white">
					A tanár még nem hirdette meg ezt a dolgozatot.
				</p>
			</Card>
		</div>
	{/if}
</div>
