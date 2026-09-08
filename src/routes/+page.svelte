<script lang="ts">
	import { browser } from '$app/environment';
	import { Check, ChevronDown, Flame, Globe, Play, Settings } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { auth } from '$lib/auth.svelte';
	import { language } from '$lib/language.svelte';
	import { LANGUAGES } from '$lib/languages';
	import { CONTENT, dueTotal, nextDeck } from '$lib/content';

	const now = new Date();
	const today = now.toLocaleDateString('hu-HU', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
	const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

	let firstName = $derived(auth.user?.name.split(' ')[0] ?? null);
	let langOpen = $state(false);

	let langDef = $derived(LANGUAGES.find((l) => l.code === language.code) ?? LANGUAGES[0]);
	let content = $derived(CONTENT[language.code]);
	let due = $derived(dueTotal(content));
	let deck = $derived(nextDeck(content));
	let stats = $derived(content.stats);
	let xpPct = $derived(Math.round((stats.xp / stats.xpGoal) * 100));
	let lessonPct = $derived(Math.round((stats.lessonsDone / stats.lessonsTotal) * 100));

	// --- Széria: a hét napjai (hétfői kezdéssel) ---
	const weekDays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
	const todayIdx = (now.getDay() + 6) % 7;

	// --- Mai teendők (nyelvenként + naponta újraindul) ---
	interface Todo {
		id: string;
		title: string;
		sub: string;
		xp: number;
		href: string;
	}

	let todos = $derived<Todo[]>([
		{
			id: 'lecke',
			title: `Folytasd: ${content.currentLessonTitle}`,
			sub: `${content.currentLessonMeta} · Leckék`,
			xp: 20,
			href: '/leckek'
		},
		{
			id: 'kartya',
			title: `Ismételj ${due} szókártyát`,
			sub: `${deck.name} · kb. 5 perc`,
			xp: 15,
			href: '/szokartyak'
		},
		{
			id: 'tanterem',
			title: 'Nézd meg a heti alkalmakat',
			sub: '3 közelgő esemény a tanteremben',
			xp: 5,
			href: '/tanterem'
		}
	]);

	function todosKey(code: string): string {
		return `leardy-todos:${code}`;
	}

	function loadDone(code: string): Record<string, boolean> {
		const empty: Record<string, boolean> = { lecke: false, kartya: false, tanterem: false };
		if (!browser) return empty;
		try {
			const raw = localStorage.getItem(todosKey(code));
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed.date === todayKey) return { ...empty, ...parsed.done };
			}
		} catch {
			// sérült mentés: üres nappal indulunk
		}
		return empty;
	}

	let done = $state(loadDone(language.code));

	$effect(() => {
		done = loadDone(language.code);
	});
	$effect(() => {
		if (browser)
			localStorage.setItem(todosKey(language.code), JSON.stringify({ date: todayKey, done }));
	});

	// Tanterem-teendő csak bejelentkezve látszik
	let visibleTodos = $derived(auth.user ? todos : todos.filter((t) => t.id !== 'tanterem'));
	let doneCount = $derived(visibleTodos.filter((t) => done[t.id]).length);
	let allDone = $derived(doneCount === visibleTodos.length);
</script>

<svelte:head>
	<title>Leardy — Főoldal</title>
	<meta name="description" content="Leardy főoldal: széria, haladás és mai teendők egy helyen." />
</svelte:head>

<!-- M3 top app bar -->
<header class="flex items-center justify-between gap-3 px-1">
	<div>
		<p class="text-[13px] font-medium text-stone-500 capitalize dark:text-stone-400">{today}</p>
		<h1 class="font-display mt-0.5 text-[32px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{#if firstName}
				Szia, {firstName}!
			{:else}
				Szia!
			{/if}
		</h1>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		<button
			onclick={() => (langOpen = true)}
			aria-label="Nyelv választása"
			class="flex h-11 items-center gap-1.5 rounded-full bg-stone-100 pr-3 pl-3.5 transition hover:bg-stone-200/70 active:scale-95 dark:bg-white/10 dark:hover:bg-white/15"
		>
			<Globe size={18} class="text-ink-600 dark:text-stone-300" />
			<span class="text-sm font-extrabold tracking-wide text-ink-900 dark:text-white">{langDef.short}</span>
			<ChevronDown size={14} class="text-stone-500 dark:text-stone-400" />
		</button>
		<a
			href="/beallitasok"
			aria-label="Beállítások"
			class="grid size-11 place-items-center rounded-full text-ink-600 transition hover:bg-stone-100 active:bg-stone-200 dark:text-stone-300 dark:hover:bg-white/10 dark:active:bg-white/15"
		>
			<Settings size={23} />
		</a>
	</div>
</header>

<!-- Nyelvválasztó drawer -->
<Drawer open={langOpen} label="Nyelv" onClose={() => (langOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Nyelv</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Melyik nyelvet tanulod most?</p>
		<ul class="mt-4 space-y-2.5">
			{#each LANGUAGES as l (l.code)}
				{@const selected = l.code === language.code}
				{@const cc = CONTENT[l.code]}
				<li>
					<button
						onclick={() => {
							language.set(l.code);
							langOpen = false;
						}}
						aria-pressed={selected}
						class={[
							'flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition active:scale-[0.99]',
							selected
								? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/15'
								: 'border-stone-200 bg-white hover:bg-stone-50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5'
						]}
					>
						<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-sm font-extrabold tracking-wide text-white">
							{l.short}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block text-[15px] font-bold text-ink-900 dark:text-white">{l.name}</span>
							<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">
								{cc.stats.lessonsDone} / {cc.stats.lessonsTotal} lecke
							</span>
						</span>
						<span
							class={[
								'grid size-6 shrink-0 place-items-center rounded-full transition',
								selected ? 'bg-brand-500 text-white' : 'border-2 border-stone-200 dark:border-white/15'
							]}
						>
							{#if selected}
								<Check size={14} strokeWidth={3.2} />
							{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
</Drawer>

<!-- M3 filled hero kártya: Széria -->
<section
	class="mt-4 rounded-[28px] bg-brand-600 p-6 text-white shadow-lg shadow-brand-600/25 dark:bg-brand-500 dark:shadow-black/30"
	aria-label="Széria"
>
	<p class="flex items-center gap-1.5 text-xs font-bold tracking-[0.12em] text-white/70 uppercase">
		<Flame size={15} fill="currentColor" class="text-amber-300" />
		Széria · {langDef.name}
	</p>
	<p class="font-display mt-2 text-[56px] leading-none font-extrabold tracking-tight">
		7 <span class="text-[24px] font-bold text-white/70">nap</span>
	</p>
	<p class="mt-2 text-[15px] text-white/75">Zsinórban tanulsz — a mai is számít.</p>
	<div class="mt-5 grid grid-cols-7 gap-2" aria-label="E heti aktivitás">
		{#each weekDays as day, i (day)}
			<span
				class={[
					'grid h-10 place-items-center rounded-full text-[13px] font-extrabold',
					i < todayIdx
						? 'bg-white text-brand-700'
						: i === todayIdx
							? 'bg-amber-300 text-ink-900'
							: 'bg-white/20 text-white/70'
				]}
			>
				{day}
			</span>
		{/each}
	</div>
</section>

<!-- M3 filled tonális kártya: Haladás -->
<section class="mt-4 rounded-[24px] bg-stone-100 p-6 dark:bg-white/5" aria-label="Haladás">
	<div class="flex items-center justify-between">
		<h2 class="font-display text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">Haladás</h2>
		<span class="rounded-full border border-stone-300 px-3 py-1 text-xs font-bold text-ink-600 dark:border-white/15 dark:text-stone-300">
			{stats.level}. szint
		</span>
	</div>
	<div class="mt-5 space-y-5">
		<div>
			<div class="flex items-baseline justify-between gap-3">
				<p class="text-[15px] font-medium text-ink-900 dark:text-white">Heti XP</p>
				<p class="font-display text-[20px] font-extrabold tracking-tight text-ink-900 dark:text-white">
					{stats.xp}<span class="text-sm font-bold text-stone-500 dark:text-stone-400"> / {stats.xpGoal}</span>
				</p>
			</div>
			<div class="relative mt-2 h-1.5 rounded-full bg-stone-300/60 dark:bg-white/10">
				<div class="h-full rounded-full bg-brand-500" style="width: {xpPct}%"></div>
				<span class="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-brand-500" style="left: calc({xpPct}% + 5px)"></span>
			</div>
		</div>
		<div>
			<div class="flex items-baseline justify-between gap-3">
				<p class="text-[15px] font-medium text-ink-900 dark:text-white">Leckék</p>
				<p class="font-display text-[20px] font-extrabold tracking-tight text-ink-900 dark:text-white">
					{stats.lessonsDone}<span class="text-sm font-bold text-stone-500 dark:text-stone-400"> / {stats.lessonsTotal}</span>
				</p>
			</div>
			<div class="relative mt-2 h-1.5 rounded-full bg-stone-300/60 dark:bg-white/10">
				<div class="h-full rounded-full bg-emerald-500" style="width: {lessonPct}%"></div>
				<span class="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-emerald-500" style="left: calc({lessonPct}% + 5px)"></span>
			</div>
		</div>
	</div>
</section>

<!-- M3 lista: Mai teendők -->
<section class="mt-7 px-1" aria-label="Mai teendők">
	<div class="flex items-baseline justify-between">
		<h2 class="font-display text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">Mai teendők</h2>
		<p class={['text-[13px] font-bold', allDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500']}>
			{doneCount} / {visibleTodos.length}
		</p>
	</div>
	<ul class="mt-1">
		{#each visibleTodos as todo (todo.id)}
			{@const isDone = done[todo.id]}
			<li class={['flex items-center gap-1 py-1 transition-opacity', isDone ? 'opacity-55' : '']}>
				<button
					onclick={() => (done[todo.id] = !isDone)}
					aria-label={isDone ? `${todo.title} — kész, visszavonás` : `${todo.title} — készre jelölés`}
					aria-pressed={isDone}
					class="grid size-11 shrink-0 place-items-center rounded-full transition active:bg-stone-100 dark:active:bg-white/10"
				>
					<span
						class={[
							'grid size-[22px] place-items-center rounded-[6px] border-2 transition-colors',
							isDone
								? 'border-emerald-500 bg-emerald-500 text-white'
								: 'border-stone-400 dark:border-white/30'
						]}
					>
						{#if isDone}
							<Check size={14} strokeWidth={3.5} />
						{/if}
					</span>
				</button>
				<a href={todo.href} class="min-w-0 flex-1 py-1.5">
					<p class={['truncate text-[16px]', isDone ? 'text-stone-400 line-through dark:text-stone-500' : 'font-medium text-ink-900 dark:text-white']}>
						{todo.title}
					</p>
					<p class="mt-0.5 truncate text-sm text-stone-500 dark:text-stone-400">{todo.sub}</p>
				</a>
				<span class="shrink-0 text-sm font-bold text-stone-400 dark:text-stone-500">+{todo.xp} XP</span>
			</li>
		{/each}
	</ul>
	{#if allDone}
		<p class="flex items-center gap-2 pt-2 text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
			<Check size={17} strokeWidth={3} /> Szép munka, mára végeztél!
		</p>
	{/if}
</section>

<!-- M3 filled button: Napi gyakorlás -->
<section class="mt-7" aria-label="Napi gyakorlás">
	<a
		href="/szokartyak"
		class="flex h-14 items-center justify-center gap-2.5 rounded-full bg-brand-500 text-base font-bold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-500/30 active:scale-[0.99]"
	>
		<Play size={20} fill="currentColor" />
		Napi gyakorlás
	</a>
	<p class="mt-2.5 text-center text-[13px] font-medium text-stone-500 dark:text-stone-400">
		{due} kártya · kb. 5 perc
	</p>
</section>
