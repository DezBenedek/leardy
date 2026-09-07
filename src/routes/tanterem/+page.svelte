<script lang="ts">
	import { ArrowLeft, Bell, CalendarDays, Trophy, Users, Video } from '@lucide/svelte';

	const upcoming = [
		{ title: 'Reggeli angol bemelegítés', time: 'Holnap · 8:00', meta: '12 fő · A2' },
		{ title: 'Szókincs-párbaj', time: 'Péntek · 18:30', meta: '8 fő · B1' },
		{ title: 'Beszélgető klub', time: 'Vasárnap · 17:00', meta: '20 fő · minden szint' }
	];

	const leaders = [
		{ name: 'Anna', xp: '2 450 XP' },
		{ name: 'Dezső', xp: '1 980 XP', you: true },
		{ name: 'Bence', xp: '1 740 XP' }
	];
</script>

<svelte:head>
	<title>Tanterem — Leardy</title>
</svelte:head>

<a href="/" class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-ink-900">
	<ArrowLeft size={16} /> Főoldal
</a>

<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
	<div class="flex items-center gap-3.5">
		<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
			<Users size={22} />
		</span>
		<div>
			<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900">Tanterem</h1>
			<p class="text-sm text-ink-600">Élő szobák, kihívások, ranglista.</p>
		</div>
	</div>
	<button class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-brand-600">
		<Bell size={16} /> Értesítést kérek az indulásról
	</button>
</section>

<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
	<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900">
		<CalendarDays size={18} class="text-ink-400" /> Közelgő alkalmak
	</h2>
	<ul class="mt-3 space-y-2.5">
		{#each upcoming as e (e.title)}
			<li class="flex items-center gap-3.5 rounded-xl border border-slate-100 p-3.5">
				<span class="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-ink-600">
					<Video size={19} />
				</span>
				<div class="min-w-0 flex-1">
					<p class="truncate text-[15px] font-semibold text-ink-900">{e.title}</p>
					<p class="text-[13px] text-ink-400">{e.time} · {e.meta}</p>
				</div>
				<span class="shrink-0 rounded-lg bg-ink-900 px-3 py-1.5 text-[13px] font-semibold text-white">Jelentkezem</span>
			</li>
		{/each}
	</ul>
</section>

<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
	<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900">
		<Trophy size={18} class="text-amber-500" /> Heti ranglista
	</h2>
	<ol class="mt-3 space-y-2">
		{#each leaders as p, i (p.name)}
			<li class={['flex items-center gap-3 rounded-xl px-3.5 py-2.5', p.you ? 'bg-brand-50' : 'bg-paper']}>
				<span class={['w-5 text-center text-[15px] font-extrabold', p.you ? 'text-brand-600' : 'text-ink-400']}>
					{i + 1}
				</span>
				<span class="flex-1 text-[15px] font-semibold text-ink-900">
					{p.name}
					{#if p.you}<span class="ml-1 text-xs font-medium text-ink-400">(te)</span>{/if}
				</span>
				<span class="text-sm font-semibold text-ink-600">{p.xp}</span>
			</li>
		{/each}
	</ol>
</section>
