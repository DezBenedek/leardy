<script lang="ts">
	import { page } from '$app/state';
	import { NAV_ITEMS, isActive } from '$lib/navigation';
	import { BookOpenText, Flame, House, Layers, Users } from '@lucide/svelte';
	import Logo from './Logo.svelte';

	const icons = [House, BookOpenText, Layers, Users];

	let pathname = $derived(page.url.pathname);
</script>

<aside class="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
	<div class="px-5 pt-6 pb-2">
		<Logo />
	</div>

	<nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4" aria-label="Fő navigáció">
		<p class="px-3 pb-2 text-[11px] font-bold tracking-wider text-ink-400 uppercase">Menü</p>
		{#each NAV_ITEMS as item, i (item.href)}
			{@const Icon = icons[i]}
			{@const active = isActive(pathname, item.href)}
			<a
				href={item.href}
				aria-current={active ? 'page' : undefined}
				class={[
					'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
					active
						? 'bg-brand-50 font-semibold text-brand-600'
						: 'font-medium text-ink-600 hover:bg-slate-100'
				]}
			>
				<Icon size={20} strokeWidth={active ? 2.2 : 1.9} />
				{item.label}
			</a>
		{/each}
	</nav>

	<div class="p-4">
		<div class="rounded-2xl border border-slate-200 bg-paper p-4">
			<p class="flex items-center gap-1.5 text-sm font-bold text-ink-900">
				<Flame size={16} class="text-amber-500" />
				7 napos sorozat
			</p>
			<div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
				<div class="h-full w-3/4 rounded-full bg-brand-500"></div>
			</div>
			<p class="mt-2 text-xs text-ink-600">Még 5 perc a mai célhoz.</p>
			<a
				href="/szokartyak"
				class="mt-3 block rounded-xl bg-brand-500 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-brand-600"
			>
				Gyakorlás
			</a>
		</div>
	</div>
</aside>
