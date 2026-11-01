<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import type { QuizQuestion } from '$lib/curriculum/curriculum';
	import { ArrowRight, ChevronRight } from '@lucide/svelte';
	import { avatarTones, initials, kahootTiles } from './live-format';
	import type { LiveParticipant } from './live-types';

	interface Props {
		current: QuizQuestion | undefined;
		qIndex: number;
		questionsLength: number;
		dist: Record<string, Record<string, number>>;
		participants: LiveParticipant[];
		busy: boolean;
		onNext: () => void;
		onStop: () => void;
		onDetail: (userId: string) => void;
	}

	let { current, qIndex, questionsLength, dist, participants, busy, onNext, onStop, onDetail }: Props = $props();
</script>

<div class="mt-4 grid gap-2.5">
	{#if current}
		{@const choiceBoard = (current.type === 'choice' || current.type === 'tf') && current.options.length > 0}
		{@const qDist = dist?.[String(qIndex)] ?? {}}
		{@const qVotes = current.options.map((o) => qDist[o] ?? 0)}
		{@const qTotal = qVotes.reduce((a, b) => a + b, 0)}
		{@const qMax = Math.max(1, ...qVotes)}
		<!-- 1. rész: a kérdés -->
		<Card>
			<div class="anim-rise py-2 text-center" style="--d:0ms">
				<p class="flex items-center justify-center gap-1.5 text-[11px] font-extrabold tracking-[0.14em] text-red-500 uppercase">
					<span class="size-1.5 animate-pulse rounded-full bg-red-500" aria-hidden="true"></span>
					Kérdés {qIndex + 1}/{questionsLength}
				</p>
				<h2 class="font-display mx-auto mt-2 max-w-3xl text-[28px] leading-tight font-extrabold tracking-tight text-balance text-ink-900 sm:text-[36px] dark:text-white">
					{current.question_text}
				</h2>
			</div>
		</Card>
		<!-- 2. rész: a válaszok -->
		<Card>
			<div class="anim-rise" style="--d:60ms">
				<p class="text-[11px] font-extrabold tracking-[0.14em] text-stone-400 uppercase tabular-nums dark:text-stone-500">
					Válaszok · {qTotal} beérkezett
				</p>
				{#if choiceBoard}
					<ul class="mt-3 grid gap-2 sm:grid-cols-2">
						{#each current.options as option, i (option)}
							{@const tile = kahootTiles[i % kahootTiles.length]}
							{@const votes = qVotes[i] ?? 0}
							<li class="overflow-hidden rounded-2xl text-white shadow-lg" style="background:{tile.bg}">
								<div class="flex min-h-[76px] items-center gap-3 px-4 py-3.5">
									<tile.Icon size={28} fill="currentColor" class="shrink-0" aria-hidden="true" />
									<span class="min-w-0 flex-1 text-[16px] leading-snug font-extrabold break-words">
										{option}
									</span>
									<span class="shrink-0 rounded-full bg-black/25 px-3 py-1 text-[15px] font-extrabold tabular-nums" aria-label="{votes} szavazat">
										{votes}
									</span>
								</div>
								<div class="h-1.5 bg-black/20" aria-hidden="true">
									<div class="h-full bg-white/80 transition-all duration-300 motion-reduce:transition-none" style="width: {Math.round((votes / qMax) * 100)}%"></div>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					{#if current.options.length > 0}
						<ul class="mt-3 grid gap-2">
							{#each current.options as option (option)}
								{@const votes = qDist[option] ?? 0}
								<li class="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
									<span class="min-w-0 flex-1 text-[15px] font-semibold break-words text-ink-900 dark:text-white">
										{option}
									</span>
									<span class="shrink-0 rounded-full bg-stone-200 px-3 py-1 text-[13px] font-extrabold tabular-nums dark:bg-white/10">
										{votes}
									</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="mt-3 text-center text-[15px] font-bold text-ink-900 tabular-nums dark:text-white">
							{qTotal} diák válaszolt
						</p>
					{/if}
				{/if}
				<div class="mt-4">
					<Button size="lg" block disabled={busy} onclick={onNext}>
						{qIndex >= questionsLength - 1 ? 'Lezárás' : 'Tovább'} <ArrowRight size={17} />
					</Button>
				</div>
			</div>
		</Card>
		<Card>
			<div class="anim-rise" style="--d:120ms">
				<h3 class="text-[15px] font-extrabold text-ink-900 dark:text-white">
					Résztvevők · <span class="tabular-nums">{participants.length}</span>
				</h3>
				{#if participants.length === 0}
					<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">
						Még senki sem csatlakozott. Kattints egy névre a válaszaiért.
					</p>
				{:else}
					<ul class="mt-2 grid gap-1.5">
						{#each participants as p, i (p.id)}
							<li>
								<button
									type="button"
									onclick={() => onDetail(p.id)}
									class="anim-rise flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none dark:hover:bg-white/5"
									style="--d:{140 + i * 40}ms"
								>
									<span class={['grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-extrabold', avatarTones[i % avatarTones.length]]} aria-hidden="true">
										{initials(p.name)}
									</span>
									<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
										{p.name}
									</span>
									<span class="shrink-0 text-[12px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
										{p.answered ?? 0}/{questionsLength}
									</span>
									<ChevronRight size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</Card>
		<div class="anim-rise" style="--d:160ms">
			<Button variant="ghost" size="md" block onclick={onStop}>Élő dolgozat leállítása</Button>
		</div>
	{/if}
</div>
