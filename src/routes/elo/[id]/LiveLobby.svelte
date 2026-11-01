<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { Radio, Users } from '@lucide/svelte';
	import { avatarTones, initials } from './live-format';
	import type { LiveParticipant } from './live-types';

	interface Props {
		title: string;
		participants: LiveParticipant[];
		teacher: boolean;
		joined: boolean;
		busy: boolean;
		wizardHref: string;
		onStart: () => void;
		onJoin: () => void;
		onWithdraw: () => void;
	}

	let { title, participants, teacher, joined, busy, wizardHref, onStart, onJoin, onWithdraw }: Props = $props();
</script>

<div class="mt-4 grid gap-2.5">
	<Card tone="brand">
		<div class="anim-rise flex flex-col items-center py-4 text-center" style="--d:0ms">
			<span class="relative grid size-14 place-items-center rounded-full bg-white/15" aria-hidden="true">
				<span class="absolute inset-0 animate-ping rounded-full bg-white/20"></span>
				<Radio size={26} class="relative text-white" />
			</span>
			<p class="mt-3 text-[11px] font-extrabold tracking-[0.14em] text-white/70 uppercase">Élő</p>
			<h2 class="font-display mt-1 text-[22px] font-extrabold tracking-tight text-white">{title}</h2>
			<p class="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-white/80">
				<Users size={15} /> {participants.length} csatlakozott diák
			</p>
		</div>
	</Card>

	<Card>
		<div class="anim-rise" style="--d:60ms">
			<h3 class="text-[15px] font-extrabold text-ink-900 dark:text-white">Résztvevők</h3>
			{#if participants.length === 0}
				<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">
					Még senki sem csatlakozott.
				</p>
			{:else}
				<ul class="mt-2 grid gap-1.5">
					{#each participants as p, i (p.id)}
						<li class="anim-rise flex items-center gap-2.5" style="--d:{80 + i * 40}ms">
							<span class={['grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-extrabold', avatarTones[i % avatarTones.length]]} aria-hidden="true">
								{initials(p.name)}
							</span>
							<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
								{p.name}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Card>

	{#if teacher}
		<div class="anim-rise grid gap-2" style="--d:120ms">
			<Button size="lg" block disabled={busy} onclick={onStart}>Indítás</Button>
			<Button variant="ghost" size="md" block onclick={onWithdraw}>Meghirdetés visszavonása</Button>
			<Button variant="ghost" size="md" block href={wizardHref}>Új meghirdetése</Button>
		</div>
	{:else if joined}
		<div class="anim-rise" style="--d:120ms">
			<Card>
				<p class="text-center text-[14px] font-bold text-ink-900 dark:text-white">
					Bent vagy. Várd meg a tanár indítását!
				</p>
			</Card>
		</div>
	{:else}
		<div class="anim-rise" style="--d:120ms">
			<Button size="lg" block disabled={busy} onclick={onJoin}>Csatlakoztam</Button>
		</div>
	{/if}
</div>
