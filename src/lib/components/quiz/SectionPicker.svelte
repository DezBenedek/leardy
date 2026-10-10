<script lang="ts">
	import { AlignLeft, Check, ChevronDown, Globe, Plus } from '@lucide/svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import type { SectionOption } from '$lib/quiz-editor';

	/* Opcionális bekezdés bekötés: vékony kártyagomb (Kártya oldal mintája),
	   Sheetben nyíló listával. Kérdéshez és kvízblokkhoz is jó. */

	interface Props {
		value: string;
		sections: SectionOption[];
		label?: string;
		placeholder?: string;
		disabled?: boolean;
		compact?: boolean;
		onchange?: (slug: string) => void;
	}

	let {
		value = $bindable(''),
		sections,
		label = 'Bekezdés',
		placeholder = 'Teljes lecke',
		disabled = false,
		compact = false,
		onchange
	}: Props = $props();

	let open = $state(false);
	let active = $derived(sections.find((s) => s.slug === value) ?? null);
	let noneSelected = $derived(value === '');

	const pickerBtn =
		'flex min-w-0 w-full items-center gap-2 rounded-2xl border border-stone-300 bg-white px-3 py-2 text-left transition outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:focus:ring-brand-500/20 dark:hover:bg-white/5';

	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';

	function pick(slug: string) {
		value = slug;
		open = false;
		onchange?.(slug);
	}
</script>

{#if compact}
	{#if active}
		<button
			type="button"
			aria-haspopup="dialog"
			aria-label="{label}: {active.title}"
			title="{label}: {active.title}"
			{disabled}
			onclick={() => (open = true)}
			class="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-300 bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-700 transition active:scale-[0.97] disabled:opacity-60 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-200"
		>
			<AlignLeft size={12} aria-hidden="true" />
			<span class="max-w-24 truncate">{active.title}</span>
		</button>
	{:else}
		<button
			type="button"
			aria-haspopup="dialog"
			aria-label="{label} hozzáadása"
			title="{label} hozzáadása"
			{disabled}
			onclick={() => (open = true)}
			class="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-stone-300 text-stone-400 transition hover:border-brand-400 hover:text-brand-600 active:scale-95 disabled:opacity-60 dark:border-white/15 dark:text-stone-500 dark:hover:border-brand-500/50 dark:hover:text-white"
		>
			<Plus size={14} aria-hidden="true" />
		</button>
	{/if}
{:else}
	<button type="button" class={pickerBtn} aria-haspopup="dialog" {disabled} onclick={() => (open = true)}>
		<span class="min-w-0 flex-1">
			<span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">
				{label}
			</span>
			<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
				{active?.title ?? (value ? 'Hiányzó bekezdés' : placeholder)}
			</span>
		</span>
		<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
	</button>
{/if}

<div use:portal>
	<Sheet {open} label="{label} választása" title={label} onClose={() => (open = false)}>
		<ul class="-mx-1 mt-2 space-y-0.5">
			<li>
				<button
					type="button"
					aria-pressed={noneSelected}
					onclick={() => pick('')}
					class={[rowBtn, noneSelected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span
						class={['grid size-9 shrink-0 place-items-center rounded-xl', noneSelected ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300']}
					>
						<Globe size={18} aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Teljes lecke</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Csak a lecke teljes kvízében jelenik meg</span>
					</span>
					{#if noneSelected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
			{#each sections as section (section.slug)}
				{@const selected = section.slug === value}
				<li>
					<button
						type="button"
						aria-pressed={selected}
						onclick={() => pick(section.slug)}
						class={[rowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
					>
						<span
							class={['grid size-9 shrink-0 place-items-center rounded-xl', selected ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300']}
						>
							<AlignLeft size={18} aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{section.title}</span>
							<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">A bekezdés gyakorlásában is megjelenik</span>
						</span>
						{#if selected}
							<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</Sheet>
</div>
