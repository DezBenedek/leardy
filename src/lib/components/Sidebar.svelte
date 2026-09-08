<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { NAV_ITEMS, isActive } from '$lib/navigation';
	import { Flame, House, Layers, LibraryBig, Users } from '@lucide/svelte';
	import Logo from './Logo.svelte';

	const icons: Record<string, typeof House> = {
		'/': House,
		'/tanterem': Users,
		'/temakorok': LibraryBig,
		'/gyakorlas': Layers
	};

	let pathname = $derived(page.url.pathname);
	let user = $derived(auth.user);
	let items = $derived(NAV_ITEMS);
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

	<nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4" aria-label="Fő navigáció">
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

	<div class="p-4">
		{#if user}
			<div class="rounded-2xl border border-stone-200 bg-stone-100 p-4 dark:border-white/10 dark:bg-white/5">
				<p class="flex items-center gap-1.5 text-sm font-bold text-ink-900 dark:text-white">
					<Flame size={16} class="text-amber-500" />
					7 napos sorozat
				</p>
				<div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
					<div class="h-full w-3/4 rounded-full bg-brand-500"></div>
				</div>
				<p class="mt-2 text-xs text-ink-600 dark:text-stone-400">Még 5 perc a mai célhoz.</p>
				<a
					href="/gyakorlas"
					class="mt-3 block rounded-full bg-brand-500 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-brand-600"
				>
					Gyakorlás
				</a>
			</div>
		{:else}
			<div class="rounded-2xl border border-stone-200 bg-stone-100 p-4 dark:border-white/10 dark:bg-white/5">
				<p class="text-sm font-bold text-ink-900 dark:text-white">Hozd létre a fiókod</p>
				<p class="mt-1 text-xs leading-relaxed text-ink-600 dark:text-stone-400">Így a Tanterem is megnyílik előtted.</p>
				<button
					onclick={() => authUI.show('register')}
					class="mt-3 block w-full rounded-full bg-brand-500 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98]"
				>
					Regisztráció
				</button>
				<button
					onclick={() => authUI.show('login')}
					class="mt-1.5 block w-full rounded-full px-3 py-2 text-center text-sm font-semibold text-ink-600 transition hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-white/10"
				>
					Bejelentkezés
				</button>
			</div>
		{/if}
	</div>
</aside>
