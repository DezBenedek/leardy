<script lang="ts">
	import { AlignLeft, Check, ChevronDown, Globe } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import type { SectionOption } from '$lib/quiz/quiz-editor';

	/* Több bekezdés kiválasztása AI generáláshoz.
	   Vékony kártyagomb, Drawerben bekattintgatós sorokkal.
	   Üres lista = teljes lecke. */

	interface Props {
		selected?: string[];
		sections: SectionOption[];
		disabled?: boolean;
		label?: string;
	}

	let { selected = $bindable<string[]>([]), sections, disabled = false, label = 'Bekezdések' }: Props = $props();

	let open = $state(false);

	const known = $derived(new Set(sections.map((s) => s.slug)));
	const active = $derived(selected.filter((slug) => known.has(slug)));
	const fullLesson = $derived(active.length === 0);

	const valueText = $derived(
		fullLesson
			? 'Teljes lecke'
			: active.length === 1
				? (sections.find((s) => s.slug === active[0])?.title ?? '1 bekezdés')
				: `${active.length} bekezdés`
	);

	const pickerBtn =
		'flex min-w-0 w-full items-center gap-2 rounded-2xl border border-stone-300 bg-white px-3 py-2 text-left transition outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:focus:ring-brand-500/20 dark:hover:bg-white/5';

	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';

	function toggle(slug: string) {
		if (disabled) return;
		selected = active.includes(slug) ? active.filter((s) => s !== slug) : [...active, slug];
	}

	function selectFull() {
		if (!disabled) selected = [];
	}
</script>

<button type="button" class={pickerBtn} aria-haspopup="dialog" {disabled} onclick={() => (open = true)}>
	<span class="min-w-0 flex-1">
		<span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">
			{label}
		</span>
		<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
			{valueText}
		</span>
	</span>
	<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
</button>

<div use:portal>
	<Drawer {open} label="{label} választása" title={label} onClose={() => (open = false)}>
		<ul class="-mx-1 mt-2 space-y-0.5">
			<li>
				<button
					type="button"
					aria-pressed={fullLesson}
					disabled={disabled}
					onclick={selectFull}
					class={[rowBtn, fullLesson ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={['grid size-9 shrink-0 place-items-center rounded-xl', fullLesson ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300']}>
						<Globe size={18} aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Teljes lecke</span>
					</span>
					{#if fullLesson}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
			{#each sections as section (section.slug)}
				{@const on = active.includes(section.slug)}
				<li>
					<button
						type="button"
						aria-pressed={on}
						disabled={disabled}
						onclick={() => toggle(section.slug)}
						class={[rowBtn, on ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
					>
						<span class={['grid size-9 shrink-0 place-items-center rounded-xl', on ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300']}>
							<AlignLeft size={18} aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{section.title}</span>
						</span>
						{#if on}
							<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</Drawer>
</div>
