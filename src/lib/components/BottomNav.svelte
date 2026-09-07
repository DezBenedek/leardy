<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '$lib/auth.svelte';
	import { NAV_ITEMS, isActive } from '$lib/navigation';
	import { BookOpenText, House, Layers, Users } from '@lucide/svelte';

	const icons: Record<string, typeof House> = {
		'/': House,
		'/leckek': BookOpenText,
		'/szokartyak': Layers,
		'/tanterem': Users
	};

	let pathname = $derived(page.url.pathname);
	let items = $derived(auth.user ? NAV_ITEMS : NAV_ITEMS.filter((i) => i.href !== '/tanterem'));
</script>

<nav class="fixed inset-x-0 bottom-0 z-40 lg:hidden" aria-label="Mobil navigáció">
	<div
		class="rounded-t-[26px] border border-b-0 border-stone-200 bg-white/95 px-3 pt-2 shadow-[0_-12px_40px_-12px_rgba(40,46,62,0.28)] backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/95"
		style="padding-bottom: max(0.625rem, env(safe-area-inset-bottom))"
	>
		<div class={['grid gap-1', items.length > 3 ? 'grid-cols-4' : 'grid-cols-3']}>
			{#each items as item (item.href)}
				{@const Icon = icons[item.href] ?? House}
				{@const active = isActive(pathname, item.href)}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="flex flex-col items-center gap-1 rounded-2xl py-1.5 transition-transform duration-150 active:scale-90"
				>
					<span
						class={[
							'grid size-12 place-items-center rounded-2xl transition-all duration-200',
							active ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30' : 'text-stone-400 dark:text-stone-500'
						]}
					>
						<Icon size={26} strokeWidth={active ? 2.1 : 1.8} />
					</span>
					<span
						class={[
							'text-[11px] leading-none',
							active ? 'font-bold text-ink-900 dark:text-white' : 'font-medium text-stone-400 dark:text-stone-500'
						]}
					>
						{item.label}
					</span>
				</a>
			{/each}
		</div>
	</div>
</nav>
