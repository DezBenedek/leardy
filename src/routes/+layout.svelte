<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { Flame, House, Languages, Layers, School, Settings, Star, Zap } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';

	const tabs = [
		{ href: '/', label: 'Tanulok', icon: House },
		{ href: '/decks', label: 'Paklik', icon: Layers },
		{ href: '/practice', label: 'Gyakorlás', icon: Zap },
		{ href: '/classroom', label: 'Tanterem', icon: School },
		{ href: '/settings', label: 'Profil', icon: Settings }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="mx-auto flex min-h-dvh w-full max-w-5xl md:gap-6">
	<!-- Desktop sidebar -->
	<aside class="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r py-6 pr-4 md:flex">
		<a href="/" class="mb-6 flex items-center gap-2.5 px-2">
			<span class="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl shadow-sm">
				<Languages class="size-5" />
			</span>
			<span class="text-xl font-bold tracking-tight">Leardy</span>
		</a>
		{#each tabs as t}
			{@const Icon = t.icon}
			<a
				href={t.href}
				aria-current={isActive(t.href) ? 'page' : undefined}
				class={cn(
					'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
					isActive(t.href)
						? 'bg-primary/10 text-primary'
						: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
				)}
			>
				<Icon class="size-[18px]" />
				{t.label}
			</a>
		{/each}

		<div class="mt-auto flex items-center gap-2 px-2 pt-6">
			<span class="bg-streak/15 text-streak inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
				<Flame class="size-3.5" /> 0
			</span>
			<span class="bg-xp/15 text-xp inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
				<Star class="size-3.5" /> 0 XP
			</span>
		</div>
	</aside>

	<!-- Tartalom -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Mobil fejléc -->
		<header class="bg-background/80 sticky top-0 z-40 border-b backdrop-blur md:hidden">
			<div class="flex items-center justify-between px-4 pt-safe">
				<a href="/" class="flex items-center gap-2 py-3">
					<span class="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg shadow-sm">
						<Languages class="size-4" />
					</span>
					<span class="text-lg font-bold tracking-tight">Leardy</span>
				</a>
				<div class="flex items-center gap-1.5">
					<span class="bg-streak/15 text-streak inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
						<Flame class="size-3.5" /> 0
					</span>
					<span class="bg-xp/15 text-xp inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
						<Star class="size-3.5" /> 0
					</span>
				</div>
			</div>
		</header>

		<main class="flex-1 px-4 pb-28 pt-4 md:px-2 md:pb-12 md:pt-8">
			<slot />
		</main>

		<!-- Mobil alsó tabbar -->
		<nav
			aria-label="Fő navigáció"
			class="bg-background/95 fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur md:hidden"
		>
			<div class="mx-auto grid max-w-lg grid-cols-5 px-2 pb-safe">
				{#each tabs as t}
					{@const Icon = t.icon}
					{@const active = isActive(t.href)}
					<a
						href={t.href}
						aria-current={active ? 'page' : undefined}
						class={cn(
							'relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
							active ? 'text-primary' : 'text-muted-foreground'
						)}
					>
						{#if active}
							<span class="bg-primary absolute top-0 h-0.5 w-8 rounded-full"></span>
						{/if}
						<Icon class="size-[22px]" strokeWidth={active ? 2.25 : 2} />
						{t.label}
					</a>
				{/each}
			</div>
		</nav>
	</div>
</div>
