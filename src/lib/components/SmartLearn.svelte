<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { ArrowRight, CircleCheck, CircleX, RotateCcw } from '@lucide/svelte';
	import type { QuizQuestion } from '$lib/curriculum';
	import { ADV_MISS_MS, ADV_OK_MS } from '$lib/practice';
	import Button from '$lib/ui/Button.svelte';

	/* Tanulás: adaptív vegyes gyakorlás 4 lépcsős ranglétrával.
	   0. könnyű felismerés (igaz-hamis / 2 választós),
	   1. választós (4, nagy paklinál néha 6),
	   2. beírós segítséggel (első betű),
	   3. sima beírós. Oda-vissza kérdez, a hiba nullázza a szót.
	   Akkor van kész, ha minden szó végigment a létrán. */

	interface Props {
		questions: QuizQuestion[];
		onMark?: (key: string, known: boolean) => void;
		/** A végén hívódik meg (megtanult, összes), például progress-mentéshez. */
		onDone?: (score: number, total: number) => void;
	}

	let { questions, onMark, onDone }: Props = $props();

	const reduced = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	interface Item {
		id: string;
		front: string;
		back: string;
	}

	interface Task {
		id: string;
		kind: 'choice' | 'write' | 'hint' | 'tf';
		prompt: string;
		expect: string;
		options: string[];
		/** Igaz-hamisnál: tényleg összetartozik a mutatott pár? */
		truth: boolean;
		/** Igaz-hamisnál a prompt mellé mutatott jelölt. */
		shown: string;
		/** Beírós segítségnél az első betű + vonalak (pl. "a _ _ _"). */
		hint: string;
	}

	function norm(v: string): string {
		return v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:]+$/g, '');
	}

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	let items = $state<Item[]>([]);
	let sides = $state<Record<string, 0 | 1 | 2 | 3 | 4>>({});
	let queue = $state<string[]>([]);
	let task = $state<Task | null>(null);
	let phase = $state<'ask' | 'feedback'>('ask');
	let value = $state('');
	let picked = $state<string | null>(null);
	let pickedTF = $state<boolean | null>(null);
	let lastCorrect = $state(false);
	let mastered = $state(0);
	let presentations = $state(0);
	/** Csak új feladatnál nő: a válasz nem rombolja újra a képernyőt. */
	let nonce = $state(0);
	let finished = $state(false);
	let notified = $state(false);
	let autoTimer: ReturnType<typeof setTimeout> | undefined;
	/** Az automata-tovább hátralévő ideje (a csík is ehhez igazodik). */
	let autoMs = $state(ADV_MISS_MS);
	/** Rövid szövegű sornál keskenyebb az oszlop (450px), egyébként max 550px. */
	let compact = $derived(
		items.length > 0 && items.every((x) => (x.front.length + x.back.length) < 60)
	);

	function clearAuto() {
		if (autoTimer !== undefined) {
			clearTimeout(autoTimer);
			autoTimer = undefined;
		}
	}

	function reset() {
		clearAuto();
		const list = shuffle(
			questions
				.filter((q) => q.question_text.trim() && q.correct_answer.trim())
				.map((q) => ({ id: q.id, front: q.question_text, back: q.correct_answer }))
		);
		items = list;
		sides = Object.fromEntries(list.map((x) => [x.id, 0]));
		queue = list.map((x) => x.id);
		mastered = 0;
		presentations = 0;
		finished = false;
		notified = false;
		buildTask();
	}

	// Új kérdéssor → elejéről. A reset() belső állapotokat is olvas,
	// ezért untrack nélkül az effect saját magát indítgatná újra (fagyás).
	$effect(() => {
		void questions.length;
		untrack(() => reset());
	});

	$effect(() => {
		if (finished && !notified && items.length > 0) {
			notified = true;
			onDone?.(mastered, items.length);
		}
	});

	// Unmountkor az időzítő sem maradhat.
	$effect(() => {
		return () => clearAuto();
	});

	function buildTask() {
		const id = queue[0];
		if (!id) {
			task = null;
			finished = true;
			return;
		}
		const item = items.find((x) => x.id === id);
		if (!item) {
			queue = queue.slice(1);
			buildTask();
			return;
		}
		const side = sides[id] ?? 0;
		// Irány véletlen: oda-vissza kérdez.
		const flip = Math.random() < 0.5;
		const prompt = flip ? item.back : item.front;
		const expect = flip ? item.front : item.back;
		// Más kártyák ugyanazon oldali szövegei (zavaró opciók / hamis párok).
		const distract = [
			...new Set(
				items
					.filter((x) => x.id !== id)
					.map((x) => (flip ? x.front : x.back))
					.filter((t) => t && norm(t) !== norm(expect))
			)
		];
		// Ranglétra: 0. könnyű felismerés (igaz-hamis / 2 választós),
		// 1. választós (4, nagy paklinál néha 6), 2. beírós segítséggel,
		// 3. sima beírós. Hiba nulláz, 4. szint után megtanult.
		let kind: Task['kind'] = 'write';
		let options: string[] = [];
		let truth = true;
		let shown = expect;
		let hint = '';
		if (side <= 0) {
			if (distract.length > 0 && Math.random() < 0.5) {
				kind = 'tf';
				truth = Math.random() < 0.5;
				shown = truth ? expect : distract[Math.floor(Math.random() * distract.length)];
			} else if (distract.length > 0) {
				kind = 'choice';
				options = shuffle([expect, distract[Math.floor(Math.random() * distract.length)]]);
			}
		} else if (side === 1) {
			if (distract.length >= 3) {
				const n = distract.length >= 5 && Math.random() < 0.4 ? 6 : 4;
				kind = 'choice';
				options = shuffle([expect, ...shuffle(distract).slice(0, n - 1)]);
			}
		} else if (side === 2) {
			kind = 'hint';
			hint = makeHint(expect);
		}
		task = { id, kind, prompt, expect, options, truth, shown, hint };
		phase = 'ask';
		value = '';
		picked = null;
		pickedTF = null;
		nonce += 1;
	}

	/** Első betű + vonalak (szóköz marad szóköz). Rövid szónál nincs segítség. */
	function makeHint(text: string): string {
		const t = text.trim();
		if (t.length <= 2) return '';
		return t
			.split('')
			.map((c, i) => (i === 0 ? c : c === ' ' ? ' ' : '_'))
			.join(' ');
	}

	function resolve(by: string) {
		if (!task || phase !== 'ask' || finished) return;
		applyResult(norm(by) === norm(task.expect));
	}

	function resolveTF(pick: boolean) {
		if (!task || task.kind !== 'tf' || phase !== 'ask' || finished) return;
		pickedTF = pick;
		applyResult(pick === task.truth);
	}

	function applyResult(ok: boolean) {
		if (!task || finished) return;
		lastCorrect = ok;
		phase = 'feedback';
		presentations += 1;
		if (ok) {
			const nl = Math.min(4, (sides[task.id] ?? 0) + 1);
			sides[task.id] = nl as 0 | 1 | 2 | 3 | 4;
			if (nl >= 4) {
				mastered += 1;
				onMark?.(task.id, true);
				queue = queue.filter((x) => x !== task!.id);
			} else {
				queue = [...queue.slice(1), task.id];
			}
		} else {
			sides[task.id] = 0;
			queue = [...queue.slice(1), task.id];
		}
		clearAuto();
		autoMs = ok ? ADV_OK_MS : ADV_MISS_MS;
		autoTimer = setTimeout(next, autoMs);
	}

	function next() {
		clearAuto();
		if (queue.length === 0 || presentations >= items.length * 12 + 10) {
			task = null;
			finished = true;
			return;
		}
		buildTask();
	}
</script>

{#if items.length === 0}
	<p class="py-4 text-center text-sm font-medium text-stone-500 dark:text-stone-400">Nincs kártya.</p>
{:else if finished || !task}
	<div class="mx-auto grid min-h-[calc(100dvh-140px)] w-full max-w-[550px] place-items-center pt-4 pb-24">
		<div class="w-full rounded-[20px] bg-stone-100 p-6 text-center sm:p-8 dark:bg-white/5">
			<p class="font-display text-[30px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">
				{mastered}/{items.length}
			</p>
			<p class="mt-2 text-sm font-medium text-stone-500 dark:text-stone-400">
				{#if mastered === items.length}
					Mind helyes.
				{:else}
					{mastered} megtanulva, {items.length - mastered} még hátravan.
				{/if}
			</p>
			<div class="mt-4 flex justify-center">
				<Button variant="outline" onclick={reset}>
					<RotateCcw size={16} /> Újra
				</Button>
			</div>
		</div>
	</div>
{:else}
	<div class="mx-auto flex min-h-[calc(100dvh-140px)] w-full flex-col">
		<div class="flex items-center gap-3">
			<div
				class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10"
				role="progressbar"
				aria-valuenow={mastered}
				aria-valuemin={0}
				aria-valuemax={items.length}
				aria-label="Megtanult szavak"
			>
				<div
					class="h-full rounded-full bg-emerald-500 transition-all duration-300 motion-reduce:transition-none"
					style="width: {(mastered / items.length) * 100}%"
				></div>
			</div>
			<p class="shrink-0 text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
				{mastered}/{items.length} megtanulva
			</p>
		</div>

		<div class="grid flex-1 place-items-center pt-4 pb-24">
			<div class={['w-full', compact ? 'max-w-[450px]' : 'max-w-[550px]']}>
				{#key task.id + task.kind + task.prompt + nonce}
					<div class="rounded-[20px] border border-stone-200 bg-white p-5 text-center sm:p-6 dark:border-white/10 dark:bg-stone-900">
						<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
							{task.kind === 'choice'
								? 'Válaszd ki a párját'
								: task.kind === 'tf'
									? 'Igaz vagy hamis?'
									: 'Írd be a párját'}
						</p>
						<p class="font-display mt-1.5 text-[24px] leading-snug font-extrabold text-balance text-ink-900 sm:text-[26px] dark:text-white">
							{task.prompt}
						</p>
						{#if task.kind === 'tf'}
							<p class="mt-1 text-[17px] font-bold text-stone-500 dark:text-stone-300">
								→ {task.shown}
							</p>
						{:else if task.kind === 'hint' && task.hint}
							<p class="mt-2 font-mono text-[15px] font-bold tracking-[0.2em] text-brand-600 dark:text-brand-100">
								{task.hint}
							</p>
						{/if}
					</div>

			{#if task.kind === 'choice'}
				<div class="mt-3 grid gap-2">
					{#each task.options as opt (opt)}
						{@const isPick = picked === opt}
						{@const isRight = phase === 'feedback' && norm(opt) === norm(task.expect)}
						<button
							type="button"
							disabled={phase !== 'ask'}
							onclick={() => {
								picked = opt;
								resolve(opt);
							}}
							class={[
								'w-full rounded-2xl border-2 px-4 py-3 text-[15px] font-bold transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none',
								phase === 'ask'
									? 'border-stone-200 bg-white text-ink-900 hover:border-brand-300 hover:bg-stone-50 dark:border-white/10 dark:bg-stone-900 dark:text-white dark:hover:border-brand-500/50'
									: isRight
										? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
										: isPick
											? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300'
											: 'border-stone-200 bg-white text-stone-400 opacity-60 dark:border-white/10 dark:bg-stone-900 dark:text-stone-500'
							]}
						>
							{opt}
						</button>
					{/each}
				</div>
			{:else if task.kind === 'tf'}
				<div class="mt-3 grid grid-cols-2 gap-2">
					{#each [true, false] as v (v)}
						{@const isPick = pickedTF === v}
						{@const isRight = phase === 'feedback' && task.truth === v}
						<button
							type="button"
							disabled={phase !== 'ask'}
							onclick={() => resolveTF(v)}
							class={[
								'flex items-center justify-center gap-1.5 rounded-2xl border-2 px-4 py-3.5 text-[15px] font-bold transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none',
								phase === 'ask'
									? 'border-stone-200 bg-white text-ink-900 hover:border-brand-300 hover:bg-stone-50 dark:border-white/10 dark:bg-stone-900 dark:text-white dark:hover:border-brand-500/50'
									: isRight
										? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
										: isPick
											? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300'
											: 'border-stone-200 bg-white text-stone-400 opacity-60 dark:border-white/10 dark:bg-stone-900 dark:text-stone-500'
							]}
						>
							{#if v}
								<CircleCheck size={17} aria-hidden="true" /> Helyes
							{:else}
								<CircleX size={17} aria-hidden="true" /> Helytelen
							{/if}
						</button>
					{/each}
				</div>
			{:else}
				<form
					class="mt-3"
					onsubmit={(e) => {
						e.preventDefault();
						if (phase === 'feedback') next();
						else resolve(value);
					}}
				>
					<input
						bind:value
						disabled={phase !== 'ask'}
						placeholder="Ide írd a választ…"
						aria-label="Válasz"
						autocomplete="off"
						class={[
							'w-full rounded-2xl border-2 bg-white px-4 py-3 text-center text-[16px] font-bold text-ink-900 outline-none transition placeholder:font-medium placeholder:text-stone-400 motion-reduce:transition-none dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500',
							phase === 'ask'
								? 'border-stone-200 focus:border-brand-500 dark:border-white/10 dark:focus:border-brand-500'
								: lastCorrect
									? 'border-emerald-500'
									: 'border-red-500'
						]}
					/>
				</form>
			{/if}

			{#if phase === 'feedback'}
				<p class={['mt-3 flex items-start justify-center gap-1.5 text-[14px] font-semibold', lastCorrect ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300']}>
					{#if lastCorrect}
						<CircleCheck size={17} class="mt-0.5 shrink-0" /> Helyes!
					{:else if task.kind === 'tf'}
						<CircleX size={17} class="mt-0.5 shrink-0" />
						<span>
							{task.truth
								? 'Ez helyes párosítás volt.'
								: 'Helyesen: ' + task.prompt + ' → ' + task.expect + '.'}
						</span>
					{:else}
						<CircleX size={17} class="mt-0.5 shrink-0" />
						<span>Helyes válasz: {task.expect}</span>
					{/if}
				</p>
				{#if !reduced}
					<div class="mt-3 h-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10" aria-hidden="true">
						<div class="anim-auto-fill h-full rounded-full bg-brand-500" style="animation-duration: {autoMs}ms"></div>
					</div>
				{/if}
				<div class="mt-3">
					<Button size="lg" block onclick={next}>Tovább <ArrowRight size={17} /></Button>
				</div>
			{/if}
				{/key}
			</div>
		</div>
	</div>
{/if}
