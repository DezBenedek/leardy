<script lang="ts">
	import { Bell, CalendarDays, Lock, Trophy, Users, Video } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';

	let user = $derived(auth.user);

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

{#if user}
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<div class="flex items-center gap-3.5">
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
				<Users size={22} />
			</span>
			<div>
				<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Tanterem</h1>
				<p class="text-sm text-ink-600 dark:text-stone-400">Élő szobák, kihívások, ranglista.</p>
			</div>
		</div>
		<button class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-brand-600">
			<Bell size={16} /> Értesítést kérek az indulásról
		</button>
	</section>

	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900 dark:text-white">
			<CalendarDays size={18} class="text-ink-400 dark:text-stone-500" /> Közelgő alkalmak
		</h2>
		<ul class="mt-3 space-y-2.5">
			{#each upcoming as e (e.title)}
				<li class="flex items-center gap-3.5 rounded-xl border border-stone-100 p-3.5 dark:border-white/10">
					<span class="grid size-10 shrink-0 place-items-center rounded-lg bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white">
						<Video size={19} />
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-[15px] font-semibold text-ink-900 dark:text-white">{e.title}</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">{e.time} · {e.meta}</p>
					</div>
					<span class="shrink-0 rounded-lg bg-ink-900 px-3 py-1.5 text-[13px] font-semibold text-white dark:bg-white dark:text-ink-900">Jelentkezem</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900 dark:text-white">
			<Trophy size={18} class="text-amber-500" /> Heti ranglista
		</h2>
		<ol class="mt-3 space-y-2">
			{#each leaders as p, i (p.name)}
				<li class={['flex items-center gap-3 rounded-xl px-3.5 py-2.5', p.you ? 'bg-brand-50 dark:bg-brand-500/20' : 'bg-stone-100 dark:bg-white/5']}>
					<span class={['w-5 text-center text-[15px] font-extrabold', p.you ? 'text-brand-600 dark:text-white' : 'text-ink-400 dark:text-stone-500']}>
						{i + 1}
					</span>
					<span class="flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">
						{p.name}
						{#if p.you}<span class="ml-1 text-xs font-medium text-ink-400 dark:text-stone-500">(te)</span>{/if}
					</span>
					<span class="text-sm font-semibold text-ink-600 dark:text-stone-400">{p.xp}</span>
				</li>
			{/each}
		</ol>
	</section>
{:else}
	<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-8 text-center dark:border-white/10 dark:bg-stone-900" aria-label="Bejelentkezés szükséges">
		<span class="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
			<Lock size={26} />
		</span>
		<h1 class="font-display mt-4 text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">
			A tanterem fiókhoz kötött
		</h1>
		<p class="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone-500 dark:text-stone-400">
			Jelentkezz be vagy regisztrálj, hogy csatlakozhass az élő alkalmakhoz és felkerülj a
			ranglistára.
		</p>
		<button
			onclick={() => authUI.show('login')}
			class="mt-5 w-full rounded-xl bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
		>
			Bejelentkezés
		</button>
		<button
			onclick={() => authUI.show('register')}
			class="mt-2 w-full rounded-xl border border-stone-200 bg-white py-3 text-[15px] font-bold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
		>
			Regisztráció
		</button>
	</section>
{/if}
