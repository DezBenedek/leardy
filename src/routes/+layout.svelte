<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { page } from '$app/state';
	import { Flame, House, Languages, Layers, School, Settings, Star, Zap } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';
	import { store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { applyTheme, resolveTheme, storedTheme } from '$lib/theme.svelte.js';
	import Toaster from '$lib/components/ui/toast/toaster.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = $derived([
		{ href: '/', label: t('nav.home'), icon: House },
		{ href: '/decks', label: t('nav.decks'), icon: Layers },
		{ href: '/practice', label: t('nav.practice'), icon: Zap },
		{ href: '/classroom', label: t('nav.classroom'), icon: School },
		{ href: '/settings', label: t('nav.profile'), icon: Settings }
	]);

	const streak = $derived(store.data.profile.streak);
	const xp = $derived(store.data.profile.xp);
	const themeMode = $derived(store.data.profile.theme);

	// Téma alkalmazása + rendszer-váltás követése (régi themeModeProvider).
	$effect(() => {
		applyTheme(themeMode);
	});

	onMount(() => {
		// Első indulás: DB-beli téma és localStorage összehangolása.
		const stored = storedTheme();
		if (store.data.profile.theme !== stored) {
			store.setProfile({ theme: stored });
		} else {
			applyTheme(stored);
		}
		const mq = matchMedia('(prefers-color-scheme: dark)');
		const onChange = () => {
			if (store.data.profile.theme === 'system') {
				document.documentElement.classList.toggle('dark', resolveTheme('system') === 'dark');
			}
		};
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-5xl md:gap-6">
	<!-- Desktop oldalsáv: 212px fiók a régi NavigationDrawer alapján -->
	<aside class="sticky top-0 hidden h-dvh w-[212px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r py-3 pr-3 md:flex">
		<a href="/" class="mb-2 flex items-center gap-2.5 px-5 pt-3 pb-2">
			<span class="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl">
				<Languages class="size-5" strokeWidth={2.25} />
			</span>
			<span class="font-display text-base font-bold tracking-tight">Leardy</span>
		</a>
		{#each tabs as tab (tab.href)}
			{@const Icon = tab.icon}
			{@const active = isActive(tab.href)}
			<a
				href={tab.href}
				aria-current={active ? 'page' : undefined}
				class={cn(
					'flex h-12 items-center gap-3 rounded-xl px-4 text-[15px] font-semibold transition-colors',
					active ? 'bg-primary/[0.08] text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
				)}
			>
				<Icon class={cn('size-5', active && 'text-primary')} strokeWidth={active ? 2.4 : 2} />
				{tab.label}
			</a>
		{/each}

		<div class="mt-auto flex items-center gap-2 px-4 pt-6">
			<span class="bg-streak/15 text-streak inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold">
				<Flame class="size-3.5" fill="currentColor" /> {streak}
			</span>
			<span class="bg-xp/15 text-xp inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold">
				<Star class="size-3.5" fill="currentColor" /> {xp} XP
			</span>
		</div>
	</aside>

	<!-- Tartalom -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Mobil fejléc -->
		<header class="bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md md:hidden">
			<div class="flex items-center justify-between px-4 pt-safe">
				<a href="/" class="flex items-center gap-2 py-3">
					<span class="bg-primary text-primary-foreground grid size-8 place-items-center rounded-xl">
						<Languages class="size-4" strokeWidth={2.25} />
					</span>
					<span class="font-display text-lg font-bold tracking-tight">Leardy</span>
				</a>
				<div class="flex items-center gap-1.5">
					<span class="bg-streak/15 text-streak inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold">
						<Flame class="size-3.5" fill="currentColor" /> {streak}
					</span>
					<span class="bg-xp/15 text-xp inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold">
						<Star class="size-3.5" fill="currentColor" /> {xp}
					</span>
				</div>
			</div>
		</header>

		<main class="flex-1 px-4 pb-28 pt-2 md:px-2 md:pb-12 md:pt-6">
			{#key page.url.pathname}
				<div in:fly={{ y: 16, duration: 300, easing: cubicOut }}>
					{@render children()}
				</div>
			{/key}
		</main>

		<!-- Mobil alsó sáv: 68px, jelző-pill a régi NavigationBar alapján -->
		<nav
			aria-label="Fő navigáció"
			class="bg-background/95 fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-md md:hidden"
		>
			<div class="mx-auto grid min-h-[72px] max-w-lg grid-cols-5 px-1 pt-1 pb-safe">
				{#each tabs as tab (tab.href)}
					{@const Icon = tab.icon}
					{@const active = isActive(tab.href)}
					<a
						href={tab.href}
						aria-current={active ? 'page' : undefined}
						class={cn(
							'flex flex-col items-center justify-center gap-1 text-[12px] font-semibold transition-colors',
							active ? 'text-foreground' : 'text-muted-foreground'
						)}
					>
						<span
							class={cn(
								'grid h-8 w-16 place-items-center rounded-full transition-all duration-300',
								active && 'bg-primary/[0.1]'
							)}
						>
							{#key `${tab.href}-${active}`}
								<span class={cn(active && 'anim-pop-in', 'grid place-items-center')}>
									<Icon class={cn('size-[22px]', active && 'text-primary')} strokeWidth={active ? 2.4 : 2} />
								</span>
							{/key}
						</span>
						{tab.label}
					</a>
				{/each}
			</div>
		</nav>
	</div>
</div>

<Toaster />
