<script lang="ts">
	import { Check, Mic, RotateCw, Volume2, X } from '@lucide/svelte';
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

	// --- Húzás (swipe): jobbra = Tudom, balra = Nem tudom ---
	const THROW = 90;
	let dragX = $state(0);
	let dragging = $state(false);
	let startX = 0;
	let startY = 0;
	let horizontal = false;

	function reset() {
		flipped = false;
		micState = 'idle';
		micMsg = '';
		dragX = 0;
		dragging = false;
	}

	function doGrade(known: boolean) {
		reset();
		onGrade(known);
	}

	function onDown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		dragging = true;
		horizontal = false;
		startX = e.clientX;
		startY = e.clientY;
		dragX = 0;
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// noop
		}
	}

	function onMove(e: PointerEvent) {
		if (!dragging) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (!horizontal && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
			dragging = false; // függőleges görgetésé a pálya
			return;
		}
		horizontal = true;
		dragX = dx;
	}

	function onUp() {
		if (!dragging) return;
		dragging = false;
		if (dragX > THROW) doGrade(true);
		else if (dragX < -THROW) doGrade(false);
		else {
			if (Math.abs(dragX) < 10) flipped = !flipped;
			dragX = 0;
		}
	}

	let hintOpacity = $derived(Math.min(1, Math.abs(dragX) / THROW));

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
	<div class="flex items-center justify-between text-xs font-semibold">
		<span class="text-ink-400 dark:text-stone-500">Húzd jobbra, ha tudod 👉 · balra, ha nem 👈</span>
	</div>
	<!-- Húzható kártya -->
	<div
		role="button"
		tabindex="0"
		aria-label="Kártya: húzd jobbra ha tudod, balra ha nem; koppints a megfordításhoz"
		onpointerdown={onDown}
		onpointermove={onMove}
		onpointerup={onUp}
		onpointercancel={() => {
			dragging = false;
			dragX = 0;
		}}
		onkeydown={(e) => {
			if (e.key === 'ArrowRight') doGrade(true);
			if (e.key === 'ArrowLeft') doGrade(false);
			if (e.key === ' ' || e.key === 'Enter') flipped = !flipped;
		}}
		class="relative mt-3 aspect-[8/5] w-full cursor-grab touch-pan-y [perspective:1200px] active:cursor-grabbing"
	>
		<div
			class="absolute inset-0 [transform-style:preserve-3d]"
			class:transition-transform={!dragging}
			class:duration-200={!dragging}
			style="transform: translateX({dragX}px) rotate({dragX / 18}deg) rotateY({flipped ? 180 : 0}deg)"
		>
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl border border-stone-200 bg-stone-100 [backface-visibility:hidden] dark:border-white/10 dark:bg-white/5">
				<p class="px-4 text-center text-3xl font-extrabold tracking-tight text-ink-900 select-none sm:text-4xl dark:text-white">
					{card.front_text}
				</p>
				{#if card.ipa}
					<p class="text-sm font-medium text-stone-400 select-none dark:text-stone-500">[{card.ipa}]</p>
				{/if}
				<p class="mt-1 inline-flex items-center gap-1 text-xs font-medium text-ink-400 select-none dark:text-stone-500">
					<RotateCw size={13} /> Koppints a jelentésért
				</p>
			</div>
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-ink-900 [backface-visibility:hidden] [transform:rotateY(180deg)] dark:bg-white">
				<p class="px-4 text-center text-3xl font-extrabold tracking-tight text-white select-none sm:text-4xl dark:text-ink-900">
					{card.back_text}
				</p>
				<p class="mt-1 text-xs font-medium text-white/60 select-none dark:text-stone-500">Tudtad?</p>
			</div>
		</div>
		<!-- Húzás-visszajelzés -->
		{#if dragX > 12}
			<div
				class="pointer-events-none absolute top-4 right-4 flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-sm font-extrabold text-white"
				style="opacity: {hintOpacity}"
			>
				<Check size={16} strokeWidth={3} /> Tudom
			</div>
		{/if}
		{#if dragX < -12}
			<div
				class="pointer-events-none absolute top-4 left-4 flex items-center gap-1 rounded-full bg-red-500 px-3 py-1.5 text-sm font-extrabold text-white"
				style="opacity: {hintOpacity}"
			>
				<X size={16} strokeWidth={3} /> Nem tudom
			</div>
		{/if}
	</div>

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
			onclick={() => doGrade(false)}
			class="rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 dark:border-white/10 dark:bg-transparent dark:text-stone-300 dark:hover:bg-white/5"
		>
			Nem tudom
		</button>
		<button
			onclick={() => doGrade(true)}
			class="rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
		>
			Tudom
		</button>
	</div>
</div>
