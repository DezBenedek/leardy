<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '$lib/state/auth.svelte';
	import { isActive, overflowNav, primaryNav } from '$lib/platform/navigation';
	import { Ellipsis, GraduationCap, House, Users } from '@lucide/svelte';
	import MoreMenu from './MoreMenu.svelte';

	const icons: Record<string, typeof House> = {
		'/': House,
		'/tanulas': GraduationCap,
		'/tanterem': Users
	};

	let pathname = $derived(page.url.pathname);
	let primary = $derived(primaryNav());
	let moreItems = $derived(overflowNav(auth.user?.role, auth.user?.is_admin));
	let moreOpen = $state(false);
</script>

<nav
	class="bottom-nav fixed inset-x-0 bottom-0 z-40 lg:hidden"
	aria-label="Mobil navigáció"
	data-sveltekit-preload-data="hover"
	data-sveltekit-preload-code="viewport"
>
	<div
		class="rounded-t-[26px] border border-b-0 border-stone-200 bg-white/95 px-2 pt-1.5 shadow-[0_-12px_40px_-12px_rgba(40,46,62,0.28)] backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/95"
		style="padding-bottom: max(0.5rem, var(--app-safe-area-bottom))"
	>
		<div class="grid grid-cols-4">
			{#each primary as item (item.href)}
				{@const Icon = icons[item.href] ?? House}
				{@const active = isActive(pathname, item.href)}
				<a
					href={item.href}
					data-tutorial={'nav-' + ({ '/': 'home', '/tanulas': 'learning', '/tanterem': 'classroom' }[item.href] ?? '')}
					aria-current={active ? 'page' : undefined}
					class="group relative flex flex-col items-center gap-1 rounded-xl py-1 transition-colors hover:bg-stone-100 active:bg-stone-100 dark:hover:bg-white/10 dark:active:bg-white/10"
				>
					<span class="grid h-9 w-[68px] place-items-center rounded-full transition-all duration-300 motion-reduce:transition-none">
						<Icon
							size={24}
							strokeWidth={active ? 2.2 : 1.9}
							class={['transition-transform duration-300 group-active:scale-90', active ? 'scale-105 text-brand-600 dark:text-white' : 'text-stone-500 dark:text-stone-400']}
						/>
					</span>
					{#if active}
						<span class="absolute -top-1.5 h-1 w-8 rounded-full bg-brand-500"></span>
					{/if}
					<span
						class={[
							'text-xs leading-none',
							active ? 'font-bold text-ink-900 dark:text-white' : 'font-medium text-stone-500 dark:text-stone-400'
						]}
					>
						{item.label}
					</span>
				</a>
			{/each}
			<button
				type="button"
				onclick={() => (moreOpen = true)}
				aria-expanded={moreOpen}
				aria-haspopup="dialog"
				aria-label="További menü megnyitása"
				class="group flex flex-col items-center gap-1 rounded-xl py-1 transition-colors hover:bg-stone-100 active:bg-stone-100 dark:hover:bg-white/10 dark:active:bg-white/10"
			>
				<span class="grid h-9 w-[68px] place-items-center rounded-full transition-transform duration-300 group-active:scale-90">
					<Ellipsis size={24} strokeWidth={1.9} class="text-stone-500 dark:text-stone-400" />
				</span>
				<span class="text-xs leading-none font-medium text-stone-500 dark:text-stone-400">Több</span>
			</button>
		</div>
	</div>
</nav>

<MoreMenu open={moreOpen} items={moreItems} {pathname} onClose={() => (moreOpen = false)} />
