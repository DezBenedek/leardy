<script lang="ts">
	import { BookOpen, Code2, Dumbbell, GraduationCap, House, School, ShieldAlert, Users } from '@lucide/svelte';
	import type { NavItem } from '$lib/platform/navigation';
	import { isActive } from '$lib/platform/navigation';

	interface Props {
		open: boolean;
		items: NavItem[];
		pathname: string;
		onClose: () => void;
	}

	let { open, items, pathname, onClose }: Props = $props();
	let render = $state(false);
	let shown = $state(false);
	let generation = 0;

	// A gombhoz legközelebb az első elem (Kártyák) kerül, felfelé nyílnak.
	let ordered = $derived([...items].reverse());

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

	const tutorialId: Record<string, string> = {
		'/': 'nav-home',
		'/tanulas': 'nav-learning',
		'/tanterem': 'nav-classroom',
		'/kartyak': 'nav-cards'
	};

	$effect(() => {
		if (open) {
			const gen = ++generation;
			render = true;
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					if (gen !== generation) return;
					shown = true;
				})
			);
			return () => {};
		} else {
			const gen = ++generation;
			shown = false;
			const t = setTimeout(() => {
				if (gen !== generation) return;
				render = false;
			}, 180);
			return () => clearTimeout(t);
		}
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={render ? onKey : undefined} />

{#if render}
	<div class="fixed inset-0 z-[60] lg:hidden" role="presentation">
		<button
			type="button"
			tabindex="-1"
			aria-label="Menü bezárása"
			onclick={onClose}
			class="absolute inset-0 bg-transparent"
		></button>
		<div
			class={[
				'pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-end gap-2 px-4 transition-all duration-200',
				shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
			]}
			style="padding-bottom: calc(var(--app-safe-area-bottom) + 84px)"
		>
			{#each ordered as item, i (item.href)}
				{@const Icon = icons[item.href] ?? House}
				<div
					class={['more-card', shown ? 'more-in' : 'more-out']}
					style:animation-delay={shown ? `${i * 65}ms` : '0ms'}
				>
					<a
						href={item.href}
						onclick={onClose}
						data-tutorial={tutorialId[item.href]}
						aria-current={isActive(pathname, item.href) ? 'page' : undefined}
						role="menuitem"
						class="pointer-events-auto flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white/95 py-2 pr-2 pl-4 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-transform active:scale-[0.97] dark:border-white/10 dark:bg-stone-900/95 dark:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]"
					>
						<span class="block truncate text-[15px] leading-tight font-bold whitespace-nowrap text-ink-900 dark:text-white">
							{item.label}
						</span>
						<span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300">
							<Icon size={19} strokeWidth={1.9} />
						</span>
					</a>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.more-card {
		opacity: 0;
		transform: translateY(34px) scale(0.9);
		transform-origin: bottom right;
	}
	.more-in {
		animation: more-rise 480ms cubic-bezier(0.34, 1.45, 0.64, 1) forwards;
	}
	.more-out {
		opacity: 0;
		transform: translateY(12px) scale(0.97);
		transition: opacity 150ms ease, transform 150ms ease;
	}
	@keyframes more-rise {
		0% { opacity: 0; transform: translateY(34px) scale(0.9); }
		55% { opacity: 1; transform: translateY(-4px) scale(1.02); }
		100% { opacity: 1; transform: translateY(0) scale(1); }
	}
	@media (prefers-reduced-motion: reduce) {
		.more-in { animation: none; opacity: 1; transform: none; }
	}
</style>
