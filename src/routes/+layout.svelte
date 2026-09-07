<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	const tabs = [
		{ href: '/', label: 'Tanulok', icon: '🏠' },
		{ href: '/decks', label: 'Paklik', icon: '🗂️' },
		{ href: '/practice', label: 'Gyakorlás', icon: '⚡' },
		{ href: '/classroom', label: 'Tanterem', icon: '🏫' },
		{ href: '/settings', label: 'Profil', icon: '⚙️' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="mx-auto flex min-h-dvh w-full max-w-5xl flex-col md:flex-row">
	<!-- Desktop sidebar -->
	<aside class="hidden w-60 shrink-0 flex-col gap-1 border-r border-black/10 p-4 md:flex dark:border-white/10">
		<a href="/" class="mb-4 flex items-center gap-2 px-2">
			<span
				class="grid size-10 place-items-center rounded-2xl bg-leardy-500 text-2xl font-black text-white shadow-hard-sm"
				>L</span
			>
			<span class="font-display text-2xl font-black tracking-tight">Leardy</span>
		</a>
		{#each tabs as t}
			<a
				href={t.href}
				aria-current={isActive(t.href) ? 'page' : undefined}
				class="flex items-center gap-3 rounded-2xl px-4 py-3 text-base font-bold transition-colors {isActive(
					t.href
				)
					? 'bg-leardy-100 text-leardy-700 dark:bg-leardy-600/20 dark:text-leardy-100'
					: 'hover:bg-black/5 dark:hover:bg-white/10'}"
			>
				<span class="text-xl" aria-hidden="true">{t.icon}</span>
				{t.label}
			</a>
		{/each}
	</aside>

	<!-- Tartalom -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Mobil fejléc -->
		<header class="flex items-center justify-between gap-2 px-4 pt-safe md:hidden">
			<a href="/" class="flex items-center gap-2 py-3">
				<span
					class="grid size-9 place-items-center rounded-2xl bg-leardy-500 text-xl font-black text-white shadow-hard-sm"
					>L</span
				>
				<span class="font-display text-xl font-black tracking-tight">Leardy</span>
			</a>
			<div
				class="flex items-center gap-1 rounded-full border-2 border-black/10 px-3 py-1 text-sm font-black dark:border-white/15"
				title="Napi sorozat"
			>
				<span aria-hidden="true">🔥</span> 0
			</div>
		</header>

		<main class="flex-1 px-4 pb-28 pt-2 md:px-8 md:pb-12 md:pt-6">
			<slot />
		</main>

		<!-- Mobil alsó tabbar -->
		<nav
			aria-label="Fő navigáció"
			class="fixed inset-x-0 bottom-0 z-50 border-t-2 border-black/10 bg-cream/95 pb-safe backdrop-blur md:hidden dark:border-white/10 dark:bg-ink/95"
		>
			<div class="mx-auto grid max-w-lg grid-cols-5">
				{#each tabs as t}
					<a
						href={t.href}
						aria-current={isActive(t.href) ? 'page' : undefined}
						class="flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold {isActive(
							t.href
						)
							? 'text-leardy-600 dark:text-leardy-500'
							: 'text-black/50 dark:text-white/50'}"
					>
						<span class="text-[22px] leading-none" aria-hidden="true">{t.icon}</span>
						{t.label}
					</a>
				{/each}
			</div>
		</nav>
	</div>
</div>
