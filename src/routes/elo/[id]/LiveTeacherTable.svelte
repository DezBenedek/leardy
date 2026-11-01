<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { ArrowRight } from '@lucide/svelte';
	import { pctOf } from './live-format';
	import type { LiveParticipant } from './live-types';

	interface Props {
		participants: LiveParticipant[];
		questionsLength: number;
		pacing: 'self' | 'synced';
		qIndex: number;
		busy: boolean;
		onNext: () => void;
		onStop: () => void;
		onDetail: (userId: string) => void;
	}

	let { participants, questionsLength, pacing, qIndex, busy, onNext, onStop, onDetail }: Props = $props();
</script>

<div class="mt-4 grid gap-2.5">
	<Card>
		<div class="anim-rise overflow-x-auto" style="--d:0ms">
			<table class="w-full min-w-[420px] text-left text-[13px]">
				<thead>
					<tr class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
						<th class="py-2 pr-2 font-extrabold">Név</th>
						<th class="px-2 py-2 font-extrabold">Hol tart</th>
						<th class="px-2 py-2 font-extrabold">Jó válasz</th>
						<th class="py-2 pl-2 font-extrabold">Haladás</th>
					</tr>
				</thead>
				<tbody>
					{#each participants as p, i (p.id)}
						{@const done = p.answered ?? 0}
						<tr
							onclick={() => onDetail(p.id)}
							class="anim-rise cursor-pointer border-t border-stone-100 transition hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none dark:border-white/5 dark:hover:bg-white/5"
							style="--d:{60 + i * 40}ms"
						>
							<td class="py-2 pr-2 font-bold text-ink-900 dark:text-white">{p.name}</td>
							<td class="px-2 py-2 font-semibold text-stone-500 tabular-nums dark:text-stone-400">
								{done}/{questionsLength}
							</td>
							<td class="px-2 py-2 font-bold text-ink-900 tabular-nums dark:text-white">{pctOf(p, questionsLength)}%</td>
							<td class="py-2 pl-2">
								<div class="h-2 w-24 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
									<div
										class="h-full rounded-full bg-brand-500 transition-all duration-300 motion-reduce:transition-none"
										style="width: {Math.min(100, Math.round((done / Math.max(questionsLength, 1)) * 100))}%"
									></div>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if participants.length === 0}
				<p class="py-2 text-[13px] font-medium text-stone-500 dark:text-stone-400">
					Még nincs csatlakozott diák.
				</p>
			{/if}
		</div>
	</Card>
	{#if pacing === 'synced'}
		<div class="anim-rise" style="--d:120ms">
			<Button size="lg" block disabled={busy} onclick={onNext}>
				{qIndex >= questionsLength - 1 ? 'Lezárás' : 'Tovább'} <ArrowRight size={17} />
			</Button>
		</div>
	{/if}
	<div class="anim-rise" style="--d:160ms">
		<Button variant="ghost" size="md" block onclick={onStop}>Élő dolgozat leállítása</Button>
	</div>
</div>
