<script lang="ts">
	import { Mic, RotateCw, Volume2 } from '@lucide/svelte';
	import { canListen, listenOnce, norm, speak, type Card } from '$lib/study';

	interface Props {
		card: Card;
		isLanguage: boolean;
		onGrade: (known: boolean) => void;
	}

	let { card, isLanguage, onGrade }: Props = $props();

	let flipped = $state(false);
	let micState = $state<'idle' | 'listening' | 'good' | 'bad'>('idle');
	let micMsg = $state('');
	let muted = $state(false);
	const listenOK = canListen();

	function playAudio() {
		if (!isLanguage || muted) return;
		speak(card.front_text, 'en-US');
	}

	async function checkPronunciation() {
		if (micState === 'listening') return;
		micState = 'listening';
		micMsg = 'Hallgatlak… mondd ki a kártyát!';
		try {
			const heard = await listenOnce('en-US');
			const ok = norm(heard).includes(norm(card.front_text)) || norm(card.front_text).includes(norm(heard));
			micState = ok ? 'good' : 'bad';
			micMsg = ok ? `Szép! („${heard.trim()}")` : `Ezt hallottam: „${heard.trim()}” — próbáld újra!`;
		} catch {
			micState = 'bad';
			micMsg = 'Nem hallottalak — ellenőrizd a mikrofont, és próbáld újra!';
		}
	}
</script>

<div>
	<p class="text-xs font-semibold text-ink-400 dark:text-stone-500">Kattints a kártyára a megfordításhoz</p>
	<button
		onclick={() => {
			flipped = !flipped;
			if (!flipped) playAudio();
		}}
		class="relative mt-3 aspect-[8/5] w-full [perspective:1200px]"
		aria-label="Kártya megfordítása"
	>
		<div
			class="absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d]"
			style="transform: rotateY({flipped ? 180 : 0}deg)"
		>
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl border border-stone-200 bg-stone-100 [backface-visibility:hidden] dark:border-white/10 dark:bg-white/5">
				<p class="px-4 text-center text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl dark:text-white">
					{card.front_text}
				</p>
				{#if card.ipa}
					<p class="text-sm font-medium text-stone-400 dark:text-stone-500">[{card.ipa}]</p>
				{/if}
				<p class="mt-1 inline-flex items-center gap-1 text-xs font-medium text-ink-400 dark:text-stone-500">
					<RotateCw size={13} /> Kattints a jelentésért
				</p>
			</div>
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-ink-900 [backface-visibility:hidden] [transform:rotateY(180deg)] dark:bg-white">
				<p class="px-4 text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl dark:text-ink-900">
					{card.back_text}
				</p>
				<p class="mt-1 text-xs font-medium text-white/60 dark:text-stone-500">Tudtad?</p>
			</div>
		</div>
	</button>

	{#if isLanguage}
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<button
				onclick={playAudio}
				class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3.5 py-2 text-[13px] font-semibold text-ink-600 transition hover:bg-stone-50 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5"
			>
				<Volume2 size={15} /> Kiejtés
			</button>
			<button
				onclick={() => (muted = !muted)}
				aria-pressed={muted}
				class="rounded-full border border-stone-200 px-3.5 py-2 text-[13px] font-semibold text-stone-500 transition hover:bg-stone-50 dark:border-white/10 dark:text-stone-400 dark:hover:bg-white/5"
			>
				{muted ? 'Hang be' : 'Hang ki'}
			</button>
			{#if listenOK}
				<button
					onclick={checkPronunciation}
					disabled={micState === 'listening'}
					class="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
				>
					<Mic size={15} /> {micState === 'listening' ? 'Hallgatlak…' : 'Kiejtés ellenőrzése'}
				</button>
			{/if}
		</div>
		{#if micMsg}
			<p
				class={[
					'mt-2 rounded-xl px-3.5 py-2.5 text-sm font-medium',
					micState === 'good'
						? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
						: micState === 'listening'
							? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-white'
							: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'
				]}
			>
				{micMsg}
			</p>
		{/if}
	{/if}

	<div class="mt-4 grid grid-cols-2 gap-2.5">
		<button
			onclick={() => {
				flipped = false;
				micState = 'idle';
				micMsg = '';
				onGrade(false);
			}}
			class="rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 dark:border-white/10 dark:bg-transparent dark:text-stone-300 dark:hover:bg-white/5"
		>
			Nem tudom
		</button>
		<button
			onclick={() => {
				flipped = false;
				micState = 'idle';
				micMsg = '';
				onGrade(true);
			}}
			class="rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
		>
			Tudom
		</button>
	</div>
</div>
