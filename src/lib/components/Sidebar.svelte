<script lang="ts">
	import { page } from '$app/state';
	import type { User } from '$lib/auth.svelte';
	import { isActive, navFor } from '$lib/navigation';
	import { House, GraduationCap, Users, Dumbbell } from '@lucide/svelte';
	import Logo from './Logo.svelte';

	// A usert a layout adja propkent (szerveradatbol), igy az SSR-kep
	// mar a profillal renderel, nincs promo-villanas es ugralas.
	let { user }: { user: User | null } = $props();

	const icons: Record<string, typeof House> = {
		'/': House,
		'/tanulas': GraduationCap,
		'/tanterem': Users,
		'/kartyak': Dumbbell
	};

	let pathname = $derived(page.url.pathname);
	let items = $derived(navFor(user?.role));
	let initial = $derived(user?.name.trim().charAt(0).toUpperCase() ?? '');
</script>

<aside class="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex dark:border-white/10 dark:bg-stone-950">
	<div class="px-5 pt-6 pb-1">
		<Logo />
	</div>

	{#if user}
		<a
			href="/beallitasok"
			class="mx-3 mt-2 flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-stone-100 dark:hover:bg-white/5"
		>
			<span class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-extrabold text-white">
				{initial}
			</span>
			<span class="min-w-0">
				<span class="block truncate text-sm font-bold text-ink-900 dark:text-white">{user.name}</span>
				<span class="block truncate text-xs text-ink-400 dark:text-stone-500">{user.email}</span>
			</span>
		</a>
	{/if}

	<nav
		class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4"
		aria-label="Fő navigáció"
	data-sveltekit-preload-data="hover"
	data-sveltekit-preload-code="viewport"
	>
		<p class="px-3 pb-2 text-[11px] font-bold tracking-wider text-ink-400 uppercase dark:text-stone-500">Menü</p>
		{#each items as item (item.href)}
			{@const Icon = icons[item.href] ?? House}
			{@const active = isActive(pathname, item.href)}
			<a
				href={item.href}
				aria-current={active ? 'page' : undefined}
				class={[
					'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
					active
						? 'bg-brand-50 font-semibold text-brand-600 dark:bg-brand-500/20 dark:text-white'
						: 'font-medium text-ink-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/5'
				]}
			>
				<Icon size={20} strokeWidth={active ? 2.2 : 1.9} />
				{item.label}
			</a>
		{/each}
	</nav>
</aside>
