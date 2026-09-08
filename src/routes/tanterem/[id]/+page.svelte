<script lang="ts">
	import { onMount } from 'svelte';
	import { studyApi, type AssignmentRow, type Classroom } from '$lib/study';
	import { get as cacheGet, peek } from '$lib/cache';

	let { params } = $props();

	let room = $state<Classroom | null>(null);
	let assigns = $state<AssignmentRow[]>([]);
	let members = $state<{ name: string }[]>([]);
	let err = $state<string | null>(null);

	onMount(() => {
		const cached = peek<{ classroom: Classroom; assignments: AssignmentRow[]; members: { name: string }[] }>(
			`classroom:${params.id}`
		);
		if (cached) {
			room = cached.classroom;
			assigns = cached.assignments;
			members = cached.members;
		}
		void (async () => {
			try {
				const data = await cacheGet(`classroom:${params.id}`, () => studyApi.classroom(params.id), 30000);
				room = data.data.classroom;
				assigns = data.data.assignments;
				members = data.data.members;
			} catch (e) {
				if (!room) err = e instanceof Error ? e.message : 'Hiba történt.';
			}
		})();
	});

	function fmtDue(ts: number): string {
		if (!ts) return 'nincs határidő';
		return new Date(ts).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head>
	<title>{room ? `${room.name} — Tanterem` : 'Osztály — Leardy'}</title>
</svelte:head>

<nav class="mt-3 text-[13px] text-stone-500 dark:text-stone-400" aria-label="Morzsa">
	<a href="/tanterem" class="hover:underline">Tanterem</a>
</nav>

{#if err && !room}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if !room}
	<p class="animate-pulse mt-2 text-sm text-stone-500 dark:text-stone-400">Betöltés…</p>
{:else}
	<section class="mt-2 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{room.name}</h1>
		<p class="text-sm text-ink-600 dark:text-stone-400">
			Kód: <span class="font-bold tracking-widest">{room.code}</span> · {members.length} tag
		</p>
	</section>

	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">Feladatok</h2>
		<ul class="mt-3 space-y-2.5">
			{#each assigns as a (a.id)}
				<li class="flex items-center gap-3.5 rounded-xl border border-stone-100 p-3.5 dark:border-white/10">
					<div class="min-w-0 flex-1">
						<p class="truncate text-[15px] font-semibold text-ink-900 dark:text-white">{a.title}</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">
							Határidő: {fmtDue(a.due_date)}
							{#if a.best !== null} · legjobb: {a.best}{/if}
						</p>
					</div>
					<a
						href="/tanterem/dolgozat/{a.id}"
						class="shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-brand-600"
					>
						{a.submitted ? 'Újra' : 'Kitöltés'}
					</a>
				</li>
			{:else}
				<p class="text-sm text-stone-500 dark:text-stone-400">Ehhez az osztályhoz még nincs kiadott feladat.</p>
			{/each}
		</ul>
	</section>

	{#if members.length > 0}
		<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
			<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">Tagok</h2>
			<ul class="mt-2 flex flex-wrap gap-2">
				{#each members as m (m.name)}
					<li class="rounded-full bg-stone-100 px-3 py-1 text-[13px] font-semibold text-ink-600 dark:bg-white/10 dark:text-stone-300">
						{m.name}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}
