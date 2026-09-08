<script lang="ts">
	import { X } from '@lucide/svelte';
	import FlashcardPlayer from '$lib/components/FlashcardPlayer.svelte';
	import QuizPlayer from '$lib/components/QuizPlayer.svelte';
	import { player } from '$lib/player.svelte';
	import type { Card, ReviewCard } from '$lib/study';

	let session = $derived(player.session);

	// --- Kártya-menet állapota (munkamenetenként újraindul) ---
	let queue = $state<string[]>([]);
	let byId = $state<Record<string, Card>>({});
	let idx = $state(0);
	let knownOnce = $state<Set<string>>(new Set());
	let graded = $state(0);
	let cardsDone = $state(false);

	// --- Kvíz időkorlát ---
	let forceDone = $state(false);
	let left = $state('');
	let timer: ReturnType<typeof setInterval> | undefined;

	function resetFor(s: NonNullable<typeof session>) {
		if (s.kind === 'cards') {
			byId = Object.fromEntries(s.cards.map((c) => [c.id, c]));
			queue = s.cards.map((c) => c.id);
			idx = 0;
			knownOnce = new Set();
			graded = 0;
			cardsDone = false;
		} else {
			forceDone = false;
			left = '';
			if (timer) {
				clearInterval(timer);
				timer = undefined;
			}
			if (s.timeLimitMins && s.timeLimitMins > 0) {
				const t0 = s.startedAt ?? Date.now();
				const tick = () => {
					const remain = s.timeLimitMins! * 60 - Math.floor((Date.now() - t0) / 1000);
					if (remain <= 0) {
						if (timer) clearInterval(timer);
						forceDone = true;
					} else {
						left = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;
					}
				};
				tick();
				timer = setInterval(tick, 1000);
			}
		}
	}

	$effect(() => {
		const s = player.session;
		if (s) resetFor(s);
		else if (timer) {
			clearInterval(timer);
			timer = undefined;
		}
	});

	// Test-görgetés zárolása, Esc = kilépés
	$effect(() => {
		const open = player.session !== null;
		document.body.style.overflow = open ? 'hidden' : '';
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && player.session) player.close();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', onKey);
		};
	});

	let card = $derived(session?.kind === 'cards' ? byId[queue[idx]] : undefined);
	let cardIsLang = $derived(
		session?.kind === 'cards' && card
			? session.isLanguage === 'auto'
				? (card as ReviewCard).topic_type === 'language'
				: session.isLanguage
			: false
	);
	let progress = $derived(
		session?.kind === 'cards' && queue.length > 0 ? Math.min(idx, queue.length) / queue.length : 0
	);

	async function grade(known: boolean) {
		const s = player.session;
		if (!s || s.kind !== 'cards') return;
		const c = byId[queue[idx]];
		if (!c) return;
		graded++;
		try {
			await s.onGrade(c, known);
		} catch {
			// a menet helyben folytatódik
		}
		if (player.session !== s) return; // időközben bezárták
		if (known) knownOnce.add(c.id);
		else if (s.repeatUnknown) queue.push(c.id);
		if (s.untilAllKnown) {
			if (knownOnce.size >= new Set(queue).size) {
				cardsDone = true;
				return;
			}
			idx++;
			return;
		}
		idx++;
		if (idx >= queue.length) cardsDone = true;
	}

	function finishCards() {
		const s = player.session;
		if (!s || s.kind !== 'cards') return;
		const n = graded;
		const cb = s.onFinish;
		player.close();
		cb(n);
	}

	function finishQuiz(score: number, total: number, answers: Record<string, string>) {
		const s = player.session;
		if (!s || s.kind !== 'quiz') return;
		const cb = s.onFinish;
		// Az összegzés az overlayben látszik (reveal), élesnél a hívó zár + mutat eredményt.
		if (!s.reveal) player.close();
		cb(score, total, answers);
	}
</script>

{#if session}
	{#key session}
		<div class="anim-fade fixed inset-0 z-[60] flex flex-col bg-white dark:bg-stone-950" role="dialog" aria-modal="true" aria-label={session.title}>
			<!-- Fejléc: tartalma az app sávszélességéhez igazodik -->
			<header class="border-b border-stone-200 dark:border-white/10">
				<div
					class="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6"
					style="padding-top: max(0.75rem, env(safe-area-inset-top))"
				>
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-[17px] font-extrabold tracking-tight text-ink-900 dark:text-white">
						{session.title}
					</h2>
					{#if session.subtitle}
						<p class="truncate text-[13px] text-stone-500 dark:text-stone-400">{session.subtitle}</p>
					{/if}
				</div>
				{#if session.kind === 'quiz' && (session.timeLimitMins ?? 0) > 0}
					<span class="shrink-0 rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700 tabular-nums dark:bg-red-400/10 dark:text-red-300">
						{left || `${session.timeLimitMins}:00`}
					</span>
				{/if}
				<button
					onclick={() => player.close()}
					aria-label="Kilépés a lejátszóból"
					class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-stone-100 px-4 py-2.5 text-sm font-bold text-ink-900 transition hover:bg-stone-200 dark:hover:bg-white/15 active:scale-95 dark:bg-white/10 dark:text-white"
				>
					<X size={17} strokeWidth={2.8} />
					<span class="hidden sm:inline">Kilépés</span>
				</button>
				</div>
			</header>

			{#if session.kind === 'cards'}
				<div class="h-1 shrink-0 bg-stone-100 dark:bg-white/10">
					<div class="h-full bg-emerald-500 transition-all" style="width: {Math.round(progress * 100)}%"></div>
				</div>
			{/if}

			<div class="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-x-clip overflow-y-auto px-4 pt-4 pb-10 sm:px-6">
				{#if session.kind === 'cards'}
					<div class="m-auto w-full">
					{#if cardsDone}
						<section class="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
							<p class="font-display text-[24px] font-extrabold text-emerald-800 dark:text-emerald-200">Kész! ({graded} értékelés)</p>
							<p class="mt-1 text-sm text-emerald-700 dark:text-emerald-300">Szép munka — a haladásod mentve.</p>
							<button
								onclick={finishCards}
								class="mt-5 w-full rounded-full bg-emerald-600 py-3 text-[15px] font-bold text-white transition hover:bg-emerald-700 active:scale-[0.99]"
							>
								Bezárás
							</button>
						</section>
					{:else if card}
						<p class="mb-1 text-center text-xs font-semibold text-ink-400 tabular-nums dark:text-stone-500">
							{Math.min(idx + 1, queue.length)} / {queue.length}
						</p>
						{#key card.id + '-' + idx}
							<FlashcardPlayer card={card} isLanguage={cardIsLang} onGrade={grade} />
						{/key}
					{/if}
					</div>
				{:else}
					<QuizPlayer
						questions={session.questions}
						reveal={session.reveal}
						submitLabel={session.submitLabel}
						forceDone={forceDone}
						onFinish={finishQuiz}
					/>
				{/if}
			</div>
		</div>
	{/key}
{/if}
