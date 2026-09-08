<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Check, Mic, Volume2, X } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { canListen, listenOnce, norm, speak, type Card } from '$lib/study';

	interface Props {
		card: Card;
		isLanguage: boolean;
		onGrade: (known: boolean) => void;
	}

	let { card, isLanguage, onGrade }: Props = $props();

	// Nyelveknél az irány mindig: magyar KÉRDÉS -> idegen VÁLASZ.
	// (Az adatban front = idegen, back = magyar — itt fordítva mutatjuk.)
	let q = $derived(isLanguage ? card.back_text : card.front_text);
	let a = $derived(isLanguage ? card.front_text : card.back_text);
	let foreign = $derived(card.front_text);

	let flipped = $state(false);
	const listenOK = canListen();

	/** Automata felolvasás forgatás után — csak ha a Szókártya-beállításban be van kapcsolva. */
	function autoAudio(): boolean {
		if (!isLanguage) return false;
		try {
			const raw = localStorage.getItem('leardy-settings');
			if (!raw) return false;
			return (JSON.parse(raw) as { autoAudio?: boolean }).autoAudio === true;
		} catch {
			return false;
		}
	}

	function toggleFlip() {
		flipped = !flipped;
		if (flipped && autoAudio()) playAudio();
	}

	// --- Kiejtés-gyakorló drawer ---
	let pronOpen = $state(false);
	let pronState = $state<'listening' | 'good' | 'bad'>('listening');
	let heard = $state('');

	async function listen() {
		pronState = 'listening';
		heard = '';
		try {
			const h = await listenOnce('en-US');
			heard = h.trim();
			const ok = norm(heard).includes(norm(foreign)) || norm(foreign).includes(norm(heard));
			pronState = ok ? 'good' : 'bad';
		} catch {
			pronState = 'bad';
		}
	}

	$effect(() => {
		if (pronOpen) void listen();
	});

	// --- Húzás (swipe): jobbra = Tudom, balra = Nem tudom ---
	// Küszöb felett a lap nem pattan vissza, hanem kirepül az irányba,
	// és csak utána cserélődik a szöveg.
	const THROW = 90;
	const FLY_OUT = 620;
	const FLY_MS = 190;
	let dragX = $state(0);
	let dragging = $state(false);
	let leaveDir = $state<0 | 1 | -1>(0);
	let startX = 0;
	let startY = 0;
	let leaveTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (leaveTimer) clearTimeout(leaveTimer);
	});

	function reset() {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
			leaveTimer = undefined;
		}
		flipped = false;
		dragX = 0;
		dragging = false;
		leaveDir = 0;
	}

	function doGrade(known: boolean) {
		reset();
		onGrade(known);
	}

	/** Kirepülés az irányba, és csak a végén értékelünk + cserélünk. */
	function fling(dir: 1 | -1) {
		if (leaveDir !== 0) return;
		leaveDir = dir;
		dragging = false;
		dragX = dir * FLY_OUT;
		leaveTimer = setTimeout(() => {
			leaveTimer = undefined;
			doGrade(dir === 1);
		}, FLY_MS);
	}

	function onDown(e: PointerEvent) {
		if (leaveDir !== 0) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		dragging = true;
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
		if (!dragging || leaveDir !== 0) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
			dragging = false; // függőleges görgetésé a pálya
			return;
		}
		dragX = dx;
	}

	function onUp() {
		if (!dragging || leaveDir !== 0) return;
		dragging = false;
		if (dragX > THROW) fling(1);
		else if (dragX < -THROW) fling(-1);
		else {
			if (Math.abs(dragX) < 10) toggleFlip();
			dragX = 0;
		}
	}

	let hintOpacity = $derived(Math.min(1, Math.abs(dragX) / THROW));

	function playAudio() {
		if (!isLanguage) return;
		speak(foreign, 'en-US');
	}
</script>

<div>
	<!-- Nagy húzható kártya -->
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
			if (leaveDir !== 0) return;
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
			if (e.key === 'ArrowRight' || e.code === 'KeyD') fling(1);
			else if (e.key === 'ArrowLeft' || e.code === 'KeyA') fling(-1);
			else if (e.key === ' ' || e.key === 'Enter') {
				e.preventDefault();
				toggleFlip();
			}
		}}
		class="anim-fade relative mt-1 h-[46vh] max-h-[440px] min-h-[300px] w-full cursor-grab touch-pan-y [perspective:1200px] active:cursor-grabbing"
	>
		<div
			class="absolute inset-0 [transform-style:preserve-3d]"
			class:transition={!dragging}
			class:duration-200={!dragging}
			style="transform: translateX({dragX}px) rotate({dragX / 18}deg) rotateY({flipped ? 180 : 0}deg); opacity: {leaveDir !== 0 ? 0 : 1}"
		>
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[28px] border border-stone-200 bg-stone-100 px-6 shadow-sm [backface-visibility:hidden] dark:border-white/10 dark:bg-white/5">
				<span class="text-[11px] font-extrabold tracking-[0.14em] text-stone-400 uppercase select-none">Kérdés</span>
				<p class="text-center text-4xl font-extrabold tracking-tight text-ink-900 select-none sm:text-5xl dark:text-white">
					{q}
				</p>
			</div>
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[28px] bg-ink-900 px-6 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
				<span class="text-[11px] font-extrabold tracking-[0.14em] text-white/50 uppercase select-none">Válasz</span>
				<p class="text-center text-4xl font-extrabold tracking-tight text-white select-none sm:text-5xl">
					{a}
				</p>
				{#if isLanguage && card.ipa}
					<p class="text-base font-medium text-white/60 select-none">[{card.ipa}]</p>
				{/if}
			</div>
		</div>
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
		<!-- Két ikon-gomb: kiejtés + kiejtés-gyakorlás -->
		<div class="mt-4 flex items-center justify-center gap-3">
			<button
				onclick={playAudio}
				aria-label="Kiejtés meghallgatása"
				title="Kiejtés"
				class="grid size-14 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600 active:scale-95"
			>
				<Volume2 size={24} />
			</button>
			{#if listenOK}
				<button
					onclick={() => (pronOpen = true)}
					aria-label="Kiejtés gyakorlása mikrofonnal"
					title="Kiejtés gyakorlása"
					class="grid size-14 place-items-center rounded-full border-2 border-brand-500 text-brand-600 transition hover:bg-brand-50 active:scale-95 dark:text-brand-400 dark:hover:bg-brand-500/10"
				>
					<Mic size={24} />
				</button>
			{/if}
		</div>
	{/if}

	<!-- Gépen (széles képernyőn) Tudom / Nem tudom gombok is vannak -->
	<div class="mt-4 hidden grid-cols-2 gap-2.5 lg:grid">
		<button
			onclick={() => fling(-1)}
			class="rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-transparent dark:text-stone-300 dark:hover:bg-white/5"
		>
			Nem tudom <span class="ml-1 text-xs text-stone-400">A</span>
		</button>
		<button
			onclick={() => fling(1)}
			class="rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 active:scale-[0.99]"
		>
			Tudom <span class="ml-1 text-xs text-white/70">D</span>
		</button>
	</div>
</div>

<!-- Kiejtés-gyakorló: külön ablak, várja a hangot, majd értékel -->
<Drawer open={pronOpen} label="Kiejtés gyakorlása" onClose={() => (pronOpen = false)}>
	<div class="px-6 pt-1 pb-6 text-center sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">
			Kiejtés gyakorlása
		</h2>
		<p class="font-display mt-3 text-[32px] font-extrabold tracking-tight text-brand-600 dark:text-white">
			{foreign}
		</p>
		{#if card.ipa}
			<p class="mt-1 text-sm font-medium text-stone-400 dark:text-stone-500">[{card.ipa}]</p>
		{/if}

		<div class="mt-5" role="status">
			{#if pronState === 'listening'}
				<span class="relative mx-auto grid size-20 place-items-center rounded-full bg-brand-500 text-white">
					<span class="absolute inset-0 animate-ping rounded-full bg-brand-500/40"></span>
					<Mic size={32} class="relative" />
				</span>
				<p class="mt-4 text-[15px] font-semibold text-ink-900 dark:text-white">Hallgatlak… mondd ki hangosan!</p>
			{:else if pronState === 'good'}
				<span class="mx-auto grid size-20 place-items-center rounded-full bg-emerald-500 text-white">
					<Check size={36} strokeWidth={3} />
				</span>
				<p class="mt-4 text-[17px] font-extrabold text-emerald-600 dark:text-emerald-300">Szép kiejtés!</p>
				{#if heard}
					<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Ezt hallottam: „{heard}”</p>
				{/if}
			{:else}
				<span class="mx-auto grid size-20 place-items-center rounded-full bg-amber-500 text-white">
					<Mic size={32} />
				</span>
				<p class="mt-4 text-[17px] font-extrabold text-amber-600 dark:text-amber-300">Nem egészen — próbáld újra!</p>
				{#if heard}
					<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Ezt hallottam: „{heard}”</p>
				{:else}
					<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Nem hallottalak — ellenőrizd a mikrofont.</p>
				{/if}
			{/if}
		</div>

		<div class="mt-6 grid grid-cols-2 gap-2.5">
			<button
				onclick={() => void listen()}
				disabled={pronState === 'listening'}
				class="rounded-full border border-stone-300 py-3 text-[15px] font-bold text-ink-600 transition hover:bg-stone-50 dark:hover:bg-white/10 disabled:opacity-50 dark:border-white/15 dark:text-stone-300"
			>
				Újra
			</button>
			<button
				onclick={() => {
					playAudio();
				}}
				class="rounded-full bg-stone-100 py-3 text-[15px] font-bold text-ink-900 transition hover:bg-stone-200 dark:hover:bg-white/15 dark:bg-white/10 dark:text-white"
			>
				Minta 🔊
			</button>
		</div>
		<button
			onclick={() => (pronOpen = false)}
			class="mt-2.5 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600"
		>
			Kész
		</button>
	</div>
</Drawer>
