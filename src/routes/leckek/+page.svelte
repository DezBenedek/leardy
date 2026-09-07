<script lang="ts">
	import { ArrowLeft, BookOpenText, CheckCircle2, Circle, Lock } from '@lucide/svelte';

	const chapters = [
		{
			title: '1. fejezet · Alapok',
			desc: 'Köszönések, bemutatkozás, alap mondatszerkezetek.',
			lessons: [
				{ title: 'Köszönések és bemutatkozás', meta: '5 perc · kész', done: true },
				{ title: 'Alap mondatszerkezetek', meta: '6 perc · 68%-nál tartasz', done: false, current: true },
				{ title: 'Kérdések és válaszok', meta: '5 perc', done: false, locked: true }
			]
		},
		{
			title: '2. fejezet · Mindennapok',
			desc: 'Család, munka, vásárlás, időpontok.',
			lessons: [
				{ title: 'Család és barátok', meta: '6 perc', done: false, locked: true },
				{ title: 'Napirend és idő', meta: '7 perc', done: false, locked: true },
				{ title: 'Vásárlás és étterem', meta: '6 perc', done: false, locked: true }
			]
		}
	];
</script>

<svelte:head>
	<title>Leckék — Leardy</title>
</svelte:head>

<a href="/" class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-ink-900">
	<ArrowLeft size={16} /> Főoldal
</a>

<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
	<div class="flex items-center gap-3.5">
		<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
			<BookOpenText size={22} />
		</span>
		<div>
			<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900">Leckék</h1>
			<p class="text-sm text-ink-600">12 / 40 lecke kész</p>
		</div>
	</div>
	<div class="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
		<div class="h-full w-[30%] rounded-full bg-brand-500"></div>
	</div>
</section>

<div class="mt-3 space-y-3">
	{#each chapters as ch (ch.title)}
		<section class="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
			<h2 class="text-[16px] font-bold text-ink-900">{ch.title}</h2>
			<p class="mt-0.5 text-sm text-ink-600">{ch.desc}</p>
			<ul class="mt-3 divide-y divide-slate-100">
				{#each ch.lessons as l (l.title)}
					<li class="flex items-center gap-3.5 py-3">
						{#if l.done}
							<CheckCircle2 size={22} class="shrink-0 text-emerald-500" />
						{:else if l.locked}
							<Lock size={19} class="shrink-0 text-slate-300" />
						{:else}
							<Circle size={22} class="shrink-0 text-brand-500" />
						{/if}
						<div class="min-w-0 flex-1">
							<p class={['truncate text-[15px] font-semibold', l.locked ? 'text-ink-400' : 'text-ink-900']}>
								{l.title}
							</p>
							<p class="text-[13px] text-ink-400">{l.meta}</p>
						</div>
						{#if l.current}
							<span class="shrink-0 rounded-lg bg-brand-500 px-3.5 py-1.5 text-[13px] font-semibold text-white">Folytatás</span>
						{:else if !l.locked && !l.done}
							<span class="shrink-0 rounded-lg bg-slate-100 px-3.5 py-1.5 text-[13px] font-semibold text-ink-600">Start</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
