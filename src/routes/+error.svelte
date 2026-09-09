<script lang="ts">
	import { page } from '$app/state';
	import { Compass, House, RotateCw, Users } from '@lucide/svelte';

	let status = $derived(page.status);
	let is404 = $derived(status === 404);
</script>

<svelte:head>
	<title>{is404 ? 'Nincs ilyen oldal (404)' : `Hiba (${status})`} — Leardy</title>
</svelte:head>

<section class="mt-6 rounded-[28px] border border-stone-200 bg-white p-8 text-center sm:p-10 dark:border-white/10 dark:bg-stone-900" aria-label={is404 ? 'Az oldal nem található' : 'Hiba történt'}>
	<span class="mx-auto grid size-16 place-items-center rounded-3xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
		<Compass size={32} />
	</span>
	<p class="font-display mt-5 text-[56px] leading-none font-extrabold tracking-tight text-ink-900 tabular-nums dark:text-white">
		{status}
	</p>
	<h1 class="font-display mt-2 text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">
		{is404 ? 'Erre még térkép sincs…' : 'Valami félrement'}
	</h1>
	<p class="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone-500 dark:text-stone-400">
		{#if is404}
			Ez az oldal nem létezik vagy átkerült máshová. Nézz szét a tanulnivalók között!
		{:else}
			{page.error?.message ?? 'Váratlan hiba történt. Próbáld újra!'}
		{/if}
	</p>
	<div class="mx-auto mt-6 grid max-w-xs gap-2">
		<a
			href="/"
			class="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
		>
			<House size={18} /> Vissza a főoldalra
		</a>
		<a
			href="/tanterem"
			class="inline-flex items-center justify-center gap-2 rounded-full border border-stone-200 bg-white py-3 text-[15px] font-bold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
		>
			<Users size={18} /> Tanterem
		</a>
		{#if !is404}
			<button
				onclick={() => location.reload()}
				class="inline-flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold text-stone-500 transition hover:text-ink-900 dark:text-stone-400 dark:hover:text-white"
			>
				<RotateCw size={16} /> Újrapróbálom
			</button>
		{/if}
	</div>
</section>
