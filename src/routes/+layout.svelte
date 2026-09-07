<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { Flame, House, Languages, Layers, School, Settings, Star, Zap } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';
	import { store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
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

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-5xl md:gap-6">
	<!-- Desktop sidebar -->
	<aside class="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r py-6 pr-4 md:flex">
		<a href="/" class="mb-6 flex items-center gap-2.5 px-2">
			<span class="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
				<Languages class="size-5" strokeWidth={2.25} />
			</span>
			<span class="font-display text-[22px] font-extrabold tracking-tight">Leardy</span>
		</a>
		{#each tabs as tab (tab.href)}
			{@const Icon = tab.icon}
			<a
				href={tab.href}
				aria-current={isActive(tab.href) ? 'page' : undefined}
				class={cn(
					'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
					isActive(tab.href)
						? 'bg-primary/12 text-primary shadow-xs'
						: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
				)}
			>
				<Icon class="size-[18px]" strokeWidth={isActive(tab.href) ? 2.4 : 2} />
				{tab.label}
			</a>
		{/each}

		<div class="mt-auto flex items-center gap-2 px-2 pt-6">
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
					<span class="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
						<Languages class="size-4" strokeWidth={2.25} />
					</span>
					<span class="font-display text-lg font-extrabold tracking-tight">Leardy</span>
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

		<main class="flex-1 px-4 pb-28 pt-4 md:px-2 md:pb-12 md:pt-8">
			{@render children()}
		</main>

		<!-- Mobil alsó tabbar -->
		<nav
			aria-label="Fő navigáció"
			class="bg-background/95 fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-md md:hidden"
		>
			<div class="mx-auto grid max-w-lg grid-cols-5 px-2 pb-safe">
				{#each tabs as tab (tab.href)}
					{@const Icon = tab.icon}
					{@const active = isActive(tab.href)}
					<a
						href={tab.href}
						aria-current={active ? 'page' : undefined}
						class={cn(
							'relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
							active ? 'text-primary' : 'text-muted-foreground'
						)}
					>
						{#if active}
							<span class="bg-primary absolute top-0 h-1 w-10 rounded-full"></span>
						{/if}
						<Icon class="size-[22px]" strokeWidth={active ? 2.4 : 2} />
						{tab.label}
					</a>
				{/each}
			</div>
		</nav>
	</div>
</div>

<Toaster />
