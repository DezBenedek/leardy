<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	let allowed = $derived(data.allowed ?? []);
	// A bootstrap oldal minden bejelentkezett fióknak jár, szerep nélkül is.
	let isBootstrap = $derived(page.url.pathname === '/admin/bootstrap');
</script>

<svelte:head>
	<title>Admin | Leardy</title>
</svelte:head>

{#if !data.user}
	<div class="rounded-2xl border border-stone-200 bg-white p-6 text-center dark:border-white/10 dark:bg-stone-900">
		<p class="font-bold">Jelentkezz be az admin felülethez.</p>
	</div>
{:else if allowed.length === 0 && !isBootstrap}
	<div class="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
		<p class="mt-2 font-bold text-ink-900 dark:text-white">Nincs admin jogosultságod</p>
		<p class="mt-1 text-sm text-stone-500">Ha iskola vezető vagy, kérd a fejlesztőtől a hozzáférést.</p>
		<a href="/admin/bootstrap" class="mt-3 inline-block text-[13px] font-bold text-brand-600 underline dark:text-brand-300">Első fejlesztő vagy? Indítsd el itt.</a>
	</div>
{:else}
	{@render children()}
{/if}
