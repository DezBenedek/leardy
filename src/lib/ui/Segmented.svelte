<script lang="ts">
	import { Check, ChevronDown, ListFilter } from '@lucide/svelte';
	import Sheet from './Sheet.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import { motionOK } from '$lib/overlay';

	interface Option {
		value: string;
		label: string;
	}

	interface Props {
		options: Option[];
		value?: string;
		ariaLabel: string;
		animated?: boolean;
		mobileDropdown?: boolean;
	}

	let { options, value = $bindable(options[0]?.value ?? ''), ariaLabel, animated = false, mobileDropdown = false }: Props = $props();
	let open = $state(false);
	let selectedIndex = $derived(Math.max(0, options.findIndex((option) => option.value === value)));
	let selected = $derived(options[selectedIndex]);

	function pick(next: string) {
		value = next;
		open = false;
	}
</script>

<div
	role="radiogroup"
	aria-label={ariaLabel}
	class={['relative', mobileDropdown ? 'hidden sm:flex' : 'flex', animated ? 'rounded-full bg-stone-100 p-1 dark:bg-white/10' : 'gap-2']}
>
	{#if animated && options.length}
		<span
			aria-hidden="true"
			data-selection-indicator
			class="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-ink-900 transition-transform duration-200 ease-out motion-reduce:transition-none dark:bg-white"
			style:width={`calc((100% - 8px) / ${options.length})`}
			style:transform={`translateX(${selectedIndex * 100}%)`}
			style:transition-duration={motionOK() ? undefined : '0ms'}
		></span>
	{/if}
	{#each options as opt (opt.value)}
		{@const active = value === opt.value}
		<button
			type="button"
			role="radio"
			aria-checked={active}
			onclick={() => (value = opt.value)}
			class={[
				'relative min-w-0 flex-1 rounded-full px-4 py-2.5 text-sm transition active:scale-[0.99]',
				'motion-reduce:transition-none motion-reduce:active:scale-100',
				active
					? ['font-bold text-white dark:text-ink-900', !animated && 'bg-ink-900 dark:bg-white']
					: ['font-semibold text-ink-600 dark:text-stone-300', animated ? 'hover:bg-black/5 dark:hover:bg-white/5' : 'bg-stone-100 hover:bg-stone-200/70 dark:bg-white/10 dark:hover:bg-white/15']
			]}
		>
			{opt.label}
		</button>
	{/each}
</div>

{#if mobileDropdown}
	<button
		type="button"
		aria-label={`${ariaLabel}: ${selected?.label ?? ''}`}
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={() => open = true}
		class="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-left transition hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none sm:hidden dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
	>
		<ListFilter size={19} class="shrink-0 text-stone-500 dark:text-stone-400" aria-hidden="true" />
		<span class="min-w-0 flex-1">
			<span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">Megjelenítés</span>
			<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">{selected?.label ?? ''}</span>
		</span>
		<ChevronDown size={16} class="shrink-0 text-stone-400" aria-hidden="true" />
	</button>
	<div use:portal>
		<Sheet {open} label={ariaLabel} title="Beküldések szűrése" onClose={() => open = false}>
			<ul class="-mx-1 mt-2 space-y-0.5">
				{#each options as option (option.value)}
					{@const active = value === option.value}
					<li>
						<button type="button" aria-pressed={active} onclick={() => pick(option.value)}
							class={['flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none', active ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}>
							<span class={['grid size-9 shrink-0 place-items-center rounded-xl', active ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300']}><ListFilter size={18} aria-hidden="true" /></span>
							<span class="min-w-0 flex-1 text-[15px] font-extrabold text-ink-900 dark:text-white">{option.label}</span>
							{#if active}<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />{/if}
						</button>
					</li>
				{/each}
			</ul>
		</Sheet>
	</div>
{/if}
