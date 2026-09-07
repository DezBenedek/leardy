<script lang="ts">
	import { browser } from '$app/environment';
	import { Check, ChevronRight, Flame, Play, Settings } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';

	const now = new Date();
	const today = now.toLocaleDateString('hu-HU', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
	const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

	let firstName = $derived(auth.user?.name.split(' ')[0] ?? null);

	// --- Széria: a hét napjai (hétfői kezdéssel) ---
	const weekDays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
	const todayIdx = (now.getDay() + 6) % 7;

	// --- Mai teendők (naponta újraindul, megmarad újratöltéskor) ---
	interface Todo {
		id: string;
		title: string;
		sub: string;
		xp: number;
		href: string;
	}

	const todos: Todo[] = [
		{
			id: 'lecke',
			title: 'Fejezd be a 4. leckét',
			sub: 'Alap mondatszerkezetek · 6 perc',
			xp: 20,
			href: '/leckek'
		},
		{
			id: 'kartya',
			title: 'Ismételj 13 szókártyát',
			sub: 'Alapszavak pakli · kb. 5 perc',
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
	];

	function loadDone(): Record<string, boolean> {
		const empty: Record<string, boolean> = { lecke: false, kartya: false, tanterem: false };
		if (!browser) return empty;
		try {
			const raw = localStorage.getItem('leardy-todos');
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed.date === todayKey) return { ...empty, ...parsed.done };
			}
		} catch {
			// sérült mentés: üres nappal indulunk
		}
		return empty;
	}

	let done = $state(loadDone());

	$effect(() => {
		if (browser) localStorage.setItem('leardy-todos', JSON.stringify({ date: todayKey, done }));
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

<!-- Fejléc -->
<header class="flex items-start justify-between gap-3 px-1">
	<div>
		<p class="text-[13px] font-semibold capitalize text-stone-500 dark:text-stone-400">{today}</p>
		<h1 class="font-display mt-1.5 text-[38px] leading-[1.02] font-extrabold tracking-tight text-ink-900 dark:text-white">
			{#if firstName}
				Szia,<br />{firstName}!
			{:else}
				Szia!
			{/if}
		</h1>
	</div>
	<a
		href="/beallitasok"
		aria-label="Beállítások"
		class="mt-1 grid size-11 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-600 transition hover:bg-stone-50 active:scale-90 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-white/10"
	>
		<Settings size={21} />
	</a>
</header>

<!-- Széria -->
<section class="mt-9 px-1" aria-label="Széria">
	<p class="text-xs font-bold tracking-[0.18em] text-stone-500 uppercase dark:text-stone-400">Széria</p>
	<div class="mt-2 flex items-center gap-3">
		<Flame size={46} fill="currentColor" strokeWidth={1} class="shrink-0 text-amber-500" />
		<p class="font-display text-[64px] leading-none font-extrabold tracking-tight text-ink-900 dark:text-white">
			7 <span class="text-[26px] font-bold text-stone-400 dark:text-stone-500">nap</span>
		</p>
	</div>
	<p class="mt-2.5 text-[15px] text-stone-600 dark:text-stone-400">Zsinórban tanulsz — a mai is számít.</p>
	<div class="mt-4 grid grid-cols-7 gap-2" aria-label="E heti aktivitás">
		{#each weekDays as day, i (day)}
			<span
				class={[
					'grid h-11 place-items-center rounded-full border text-sm font-extrabold',
					i < todayIdx
						? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-stone-950'
						: i === todayIdx
							? 'border-amber-500 bg-amber-400 text-ink-900'
							: 'border-stone-300 text-stone-400 dark:border-white/15 dark:text-stone-500'
				]}
			>
				{day}
			</span>
		{/each}
	</div>
</section>

<div class="my-8 border-t border-stone-200 dark:border-white/10" aria-hidden="true"></div>

<!-- Haladás -->
<section class="px-1" aria-label="Haladás">
	<div class="flex items-baseline justify-between">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Haladás</h2>
		<p class="text-[13px] font-bold text-amber-600 dark:text-amber-400">12. szint</p>
	</div>
	<div class="mt-5 space-y-6">
		<div>
			<div class="flex items-baseline justify-between gap-3">
				<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Heti XP</p>
				<p class="font-display text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">
					320<span class="text-sm font-bold text-stone-400 dark:text-stone-500"> / 500</span>
				</p>
			</div>
			<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
				<div class="h-full w-[64%] rounded-full bg-brand-500"></div>
			</div>
		</div>
		<div>
			<div class="flex items-baseline justify-between gap-3">
				<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Leckék</p>
				<p class="font-display text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">
					12<span class="text-sm font-bold text-stone-400 dark:text-stone-500"> / 40</span>
				</p>
			</div>
			<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
				<div class="h-full w-[30%] rounded-full bg-emerald-500"></div>
			</div>
		</div>
	</div>
</section>

<div class="my-8 border-t border-stone-200 dark:border-white/10" aria-hidden="true"></div>

<!-- Mai teendők -->
<section class="px-1" aria-label="Mai teendők">
	<div class="flex items-baseline justify-between">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Mai teendők</h2>
		<p class={['text-[13px] font-bold', allDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500']}>
			{doneCount} / {visibleTodos.length}
		</p>
	</div>
	<ul class="mt-1 divide-y divide-stone-200 dark:divide-white/10">
		{#each visibleTodos as todo (todo.id)}
			{@const isDone = done[todo.id]}
			<li class={['flex items-center gap-4 py-4 transition-opacity', isDone ? 'opacity-55' : '']}>
				<button
					onclick={() => (done[todo.id] = !isDone)}
					aria-label={isDone ? `${todo.title} — kész, visszavonás` : `${todo.title} — készre jelölés`}
					aria-pressed={isDone}
					class={[
						'grid size-8 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90',
						isDone
							? 'border-emerald-500 bg-emerald-500 text-white'
							: 'border-stone-300 bg-transparent hover:border-brand-500 dark:border-white/25'
					]}
				>
					{#if isDone}
						<Check size={16} strokeWidth={3.2} />
					{/if}
				</button>
				<a href={todo.href} class="min-w-0 flex-1">
					<p class={['truncate text-[16px] font-semibold', isDone ? 'text-stone-400 line-through dark:text-stone-500' : 'text-ink-900 dark:text-white']}>
						{todo.title}
					</p>
					<p class="mt-0.5 truncate text-[13px] text-stone-500 dark:text-stone-400">{todo.sub}</p>
				</a>
				<span class="shrink-0 text-sm font-bold text-stone-400 dark:text-stone-500">+{todo.xp} XP</span>
			</li>
		{/each}
	</ul>
	{#if allDone}
		<p class="flex items-center gap-2 pt-1 text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
			<Check size={17} strokeWidth={3} /> Szép munka, mára végeztél!
		</p>
	{/if}
</section>

<!-- Napi gyakorlás -->
<section class="mt-9" aria-label="Napi gyakorlás">
	<a
		href="/szokartyak"
		class="group flex items-center gap-4 rounded-[28px] bg-ink-900 p-6 text-white transition active:scale-[0.99] dark:bg-white dark:text-ink-900"
	>
		<span class="grid size-14 shrink-0 place-items-center rounded-full bg-amber-400 text-ink-900">
			<Play size={24} strokeWidth={2.2} fill="currentColor" class="ml-0.5" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="font-display block text-[22px] font-bold tracking-tight">Napi gyakorlás</span>
			<span class="mt-0.5 block text-sm text-white/60 dark:text-stone-600">13 kártya · kb. 5 perc</span>
		</span>
		<ChevronRight size={24} class="shrink-0 text-white/40 transition-transform duration-200 group-hover:translate-x-1 dark:text-stone-400" />
	</a>
</section>
