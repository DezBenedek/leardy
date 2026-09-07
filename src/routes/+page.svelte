<script lang="ts">
	import { browser } from '$app/environment';
	import { Check, ChevronRight, Flame, Play, Settings } from '@lucide/svelte';

	const now = new Date();
	const today = now.toLocaleDateString('hu-HU', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
	const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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

	let doneCount = $derived(todos.filter((t) => done[t.id]).length);
</script>

<svelte:head>
	<title>Leardy — Főoldal</title>
	<meta name="description" content="Leardy főoldal: széria, haladás és mai teendők egy helyen." />
</svelte:head>

<!-- Köszöntés -->
<section class="flex items-center justify-between gap-3">
	<div>
		<p class="text-[13px] font-medium text-ink-400 capitalize">{today}</p>
		<h1 class="mt-0.5 text-[26px] font-extrabold tracking-tight text-ink-900 sm:text-3xl">
			Szia!
		</h1>
	</div>
	<a
		href="/beallitasok"
		aria-label="Beállítások"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-ink-600 transition hover:bg-slate-50 active:scale-90"
	>
		<Settings size={20} />
	</a>
</section>

<!-- Széria -->
<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-5" aria-label="Széria">
	<div class="flex items-center gap-3.5">
		<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-500">
			<Flame size={22} />
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="text-[16px] font-bold text-ink-900">Széria</h2>
			<p class="truncate text-[13px] text-ink-600">7 napja folyamatosan tanulsz</p>
		</div>
		<span class="shrink-0 text-[26px] font-extrabold tracking-tight text-ink-900">7</span>
	</div>
	<div class="mt-4 grid grid-cols-7 gap-1.5" aria-label="E heti aktivitás">
		{#each weekDays as day, i (day)}
			<div class="flex flex-col items-center gap-1">
				<span
					class={[
						'grid size-9 place-items-center rounded-full text-xs font-bold transition-colors',
						i < todayIdx
							? 'bg-brand-500 text-white'
							: i === todayIdx
								? 'bg-amber-100 text-amber-700 ring-2 ring-amber-400'
								: 'bg-slate-100 text-slate-400'
					]}
				>
					{day}
				</span>
			</div>
		{/each}
	</div>
</section>

<!-- Haladás -->
<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5" aria-label="Haladás">
	<h2 class="text-[16px] font-bold text-ink-900">Haladás</h2>
	<div class="mt-4 space-y-4">
		<div>
			<div class="flex items-baseline justify-between text-sm">
				<p class="font-semibold text-ink-900">Heti XP</p>
				<p class="text-[13px] font-medium text-ink-400">320 / 500</p>
			</div>
			<div class="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
				<div class="h-full w-[64%] rounded-full bg-brand-500"></div>
			</div>
		</div>
		<div>
			<div class="flex items-baseline justify-between text-sm">
				<p class="font-semibold text-ink-900">Leckék</p>
				<p class="text-[13px] font-medium text-ink-400">12 / 40</p>
			</div>
			<div class="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
				<div class="h-full w-[30%] rounded-full bg-emerald-500"></div>
			</div>
		</div>
	</div>
</section>

<!-- Mai teendők -->
<section class="mt-6" aria-label="Mai teendők">
	<div class="flex items-baseline justify-between">
		<h2 class="text-lg font-bold text-ink-900">Mai teendők</h2>
		<p class="text-[13px] font-semibold text-ink-400">{doneCount} / {todos.length} kész</p>
	</div>
	<ul class="mt-3 space-y-2.5">
		{#each todos as todo (todo.id)}
			{@const isDone = done[todo.id]}
			<li
				class={[
					'flex items-center gap-3.5 rounded-2xl border bg-white p-4 transition',
					isDone ? 'border-slate-100 opacity-60' : 'border-slate-200'
				]}
			>
				<button
					onclick={() => (done[todo.id] = !isDone)}
					aria-label={isDone ? `${todo.title} — kész, visszavonás` : `${todo.title} — készre jelölés`}
					aria-pressed={isDone}
					class={[
						'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90',
						isDone
							? 'border-emerald-500 bg-emerald-500 text-white'
							: 'border-slate-300 bg-white hover:border-brand-500'
					]}
				>
					{#if isDone}
						<Check size={14} strokeWidth={3} />
					{/if}
				</button>
				<a href={todo.href} class="min-w-0 flex-1">
					<p class={['truncate text-[15px] font-semibold', isDone ? 'text-ink-400 line-through' : 'text-ink-900']}>
						{todo.title}
					</p>
					<p class="truncate text-[13px] text-ink-400">{todo.sub}</p>
				</a>
				<span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-ink-600">
					+{todo.xp} XP
				</span>
			</li>
		{/each}
	</ul>
</section>

<!-- Napi gyakorlás -->
<section class="mt-6" aria-label="Napi gyakorlás">
	<a
		href="/szokartyak"
		class="flex items-center gap-4 rounded-2xl bg-brand-500 p-5 text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600 active:scale-[0.98]"
	>
		<span class="grid size-12 shrink-0 place-items-center rounded-xl bg-white/20">
			<Play size={24} strokeWidth={2.4} class="ml-0.5" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[17px] font-bold">Napi gyakorlás</span>
			<span class="block truncate text-[13px] text-white/75">13 kártya · kb. 5 perc</span>
		</span>
		<ChevronRight size={22} class="shrink-0 text-white/70" />
	</a>
</section>
