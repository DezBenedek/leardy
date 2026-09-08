<script lang="ts">
	import { page } from '$app/state';
	import { NAV_ITEMS, isActive } from '$lib/navigation';
	import { House, Layers, LibraryBig, Users } from '@lucide/svelte';

	const icons: Record<string, typeof House> = {
		'/': House,
		'/tanterem': Users,
		'/temakorok': LibraryBig,
		'/gyakorlas': Layers
	};

	let pathname = $derived(page.url.pathname);
	let items = $derived(NAV_ITEMS);
</script>

<nav class="fixed inset-x-0 bottom-0 z-40 lg:hidden" aria-label="Mobil navigáció">
	<div
		class="rounded-t-[26px] border border-b-0 border-stone-200 bg-white/95 px-2 pt-1.5 shadow-[0_-12px_40px_-12px_rgba(40,46,62,0.28)] backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/95"
		style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom))"
	>
		<div class={['grid', items.length > 3 ? 'grid-cols-4' : 'grid-cols-3']}>
			{#each items as item (item.href)}
				{@const Icon = icons[item.href] ?? House}
				{@const active = isActive(pathname, item.href)}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="group flex flex-col items-center gap-1 rounded-xl py-1 transition-colors active:bg-stone-100 dark:active:bg-white/10"
				>
					<span
						class={[
							'grid h-9 w-[68px] place-items-center rounded-full transition-colors duration-200',
							active
								? 'bg-brand-50 dark:bg-brand-500/25'
								: 'group-active:bg-stone-100 dark:group-active:bg-white/10'
						]}
					>
						<Icon
							size={24}
							strokeWidth={active ? 2.2 : 1.9}
							class={active ? 'text-brand-600 dark:text-white' : 'text-stone-500 dark:text-stone-400'}
						/>
					</span>
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
		</div>
	</div>
</nav>
