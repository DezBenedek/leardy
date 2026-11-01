<script lang="ts">
	import { page } from '$app/state';
	import type { User } from '$lib/state/auth.svelte';
	import { adminNavFor, isActive, overflowNav, primaryNav } from '$lib/platform/navigation';
	import { BookOpen, Code2, Dumbbell, GraduationCap, House, School, ShieldAlert, Users } from '@lucide/svelte';
	import Logo from './Logo.svelte';

	// A usert a layout adja propkent (szerveradatbol), igy az SSR-kep
	// mar a profillal renderel, nincs promo-villanas es ugralas.
	let { user }: { user: User | null } = $props();

	const icons: Record<string, typeof House> = {
		'/': House,
		'/tanulas': GraduationCap,
		'/tanterem': Users,
		'/kartyak': Dumbbell,
		'/admin/iskola': School,
		'/admin/moderalas': ShieldAlert,
		'/admin/tananyag': BookOpen,
		'/admin/fejleszto': Code2
	};

	let pathname = $derived(page.url.pathname);
	// A Beállítások nincs a menüben: a fenti profilkártya nyitja.
	let mainItems = $derived([...primaryNav(), ...overflowNav(user?.role, user?.is_admin)].filter((i) => !i.href.startsWith('/admin')));
	let adminItems = $derived(adminNavFor(user?.role, user?.is_admin));
	let initial = $derived(user?.name.trim().charAt(0).toUpperCase() ?? '');
</script>

<aside class="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex dark:border-white/10 dark:bg-stone-950">
	<div class="px-5 pt-6 pb-1">
		<Logo />
	</div>

	{#if user}
		<a
			href="/beallitasok"
			aria-label="Beállítások megnyitása"
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
		{#each mainItems as item (item.href)}
			{@const Icon = icons[item.href] ?? House}
			{@const active = isActive(pathname, item.href)}
			<a
				href={item.href}
				data-tutorial={'nav-' + ({ '/': 'home', '/tanulas': 'learning', '/tanterem': 'classroom', '/kartyak': 'cards' }[item.href] ?? '')}
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
		{#if adminItems.length > 0}
			<p class="px-3 pt-4 pb-2 text-[11px] font-bold tracking-wider text-ink-400 uppercase dark:text-stone-500">Admin</p>
			{#each adminItems as item (item.href)}
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
		{/if}
	</nav>
</aside>
