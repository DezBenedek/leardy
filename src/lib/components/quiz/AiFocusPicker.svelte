<script lang="ts">
	import { BookOpen, CalendarDays, Check, ChevronDown, Languages, Shuffle, Users } from '@lucide/svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';

	/* AI generálás fókusza lenyíló listából: miből generáljon. */

	export type AiFocusId = 'mixed' | 'vocab' | 'definitions' | 'dates' | 'people';

	interface Props {
		value?: AiFocusId;
		disabled?: boolean;
		label?: string;
	}

	let { value = $bindable<AiFocusId>('mixed'), disabled = false, label = 'Fókusz' }: Props = $props();

	let open = $state(false);

	const OPTIONS: { id: AiFocusId; title: string; icon: typeof Shuffle }[] = [
		{ id: 'mixed', title: 'Vegyes', icon: Shuffle },
		{ id: 'vocab', title: 'Szószedet', icon: Languages },
		{ id: 'definitions', title: 'Definíciók', icon: BookOpen },
		{ id: 'dates', title: 'Időpontok', icon: CalendarDays },
		{ id: 'people', title: 'Személyek', icon: Users }
	];

	const active = $derived(OPTIONS.find((o) => o.id === value) ?? OPTIONS[0]);

	const pickerBtn =
		'flex min-w-0 w-full items-center gap-2 rounded-2xl border border-stone-300 bg-white px-3 py-2 text-left transition outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:focus:ring-brand-500/20 dark:hover:bg-white/5';

	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';

	function pick(id: AiFocusId) {
		value = id;
		open = false;
	}
</script>

<button type="button" class={pickerBtn} aria-haspopup="dialog" {disabled} onclick={() => (open = true)}>
	<span class="min-w-0 flex-1">
		<span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">
			{label}
		</span>
		<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
			{active.title}
		</span>
	</span>
	<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
</button>

<div use:portal>
	<Sheet {open} label="{label} választása" title={label} onClose={() => (open = false)}>
		<ul class="-mx-1 mt-2 space-y-0.5">
			{#each OPTIONS as option (option.id)}
				{@const selected = option.id === value}
				{@const Icon = option.icon}
				<li>
					<button
						type="button"
						aria-pressed={selected}
						disabled={disabled}
						onclick={() => pick(option.id)}
						class={[rowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
					>
						<span class={['grid size-9 shrink-0 place-items-center rounded-xl', selected ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300']}>
							<Icon size={18} aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{option.title}</span>
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
