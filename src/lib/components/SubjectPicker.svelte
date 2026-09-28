<script lang="ts" module>
	/** A Sheetet a body végére mozgatja, hogy Drawer belsejéből nyitva is
	    a nézethez igazodjon (a Drawer transzformált panelje különben magába zárná). */
	export function portal(node: HTMLElement): { destroy: () => void } {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}
</script>

<script lang="ts">
	import { BookOpenText, Check, ChevronDown, Landmark, Languages, Leaf, Shapes, X } from '@lucide/svelte';
	import type { Subject } from '$lib/curriculum';
	import Sheet from '$lib/ui/Sheet.svelte';

	/* Tantárgyválasztó a Kártya oldal mintájára: vékony kártyagomb,
	   Sheetben nyíló opciólista ikonokkal. Bárhol használható, Drawerben is. */

	interface Props {
		subjects: Subject[];
		value?: string;
		allowEmpty?: boolean;
		label?: string;
		placeholder?: string;
		disabled?: boolean;
	}

	let {
		subjects,
		value = $bindable(''),
		allowEmpty = true,
		label = 'Tantárgy',
		placeholder = 'Válassz…',
		disabled = false
	}: Props = $props();

	let open = $state(false);

	const subjectIcons: Record<string, typeof Landmark> = {
		landmark: Landmark,
		leaf: Leaf,
		languages: Languages,
		book: BookOpenText
	};

	let active = $derived(subjects.find((s) => s.id === value) ?? null);

	const pickerBtn =
		'flex min-w-0 w-full items-center gap-2 rounded-2xl border border-stone-300 bg-white px-3 py-2 text-left transition outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:focus:ring-brand-500/20 dark:hover:bg-white/5';

	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';
	const rowTile = (selected: boolean) =>
		[
			'grid size-9 shrink-0 place-items-center rounded-xl',
			selected
				? 'bg-brand-500 text-white'
				: 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300'
		].join(' ');

	function pick(id: string) {
		value = id;
		open = false;
	}
</script>

<button
	type="button"
	class={pickerBtn}
	aria-haspopup="dialog"
	{disabled}
	onclick={() => (open = true)}
>
	<span class="min-w-0 flex-1">
		<span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">
			{label}
		</span>
		<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
			{active?.title ?? placeholder}
		</span>
	</span>
	<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
</button>

<!-- Mindig mountolva: a Sheet sajat open allapota vezerli a becsukas animaciot is. -->
<div use:portal>
	<Sheet {open} label="{label} választása" title={label} onClose={() => (open = false)}>
			<ul class="-mx-1 mt-2 space-y-0.5">
				{#if allowEmpty}
					{@const selected = value === ''}
					<li>
						<button
							type="button"
							aria-pressed={selected}
							onclick={() => pick('')}
							class={[rowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
						>
							<span class={rowTile(selected)}>
								<X size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Nincs tantárgy</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Általános osztály</span>
							</span>
							{#if selected}
								<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
							{/if}
						</button>
					</li>
				{/if}
				{#each subjects as s (s.id)}
					{@const SIcon = subjectIcons[s.icon] ?? Shapes}
					{@const selected = s.id === value}
					<li>
						<button
							type="button"
							aria-pressed={selected}
							onclick={() => pick(s.id)}
							class={[rowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
						>
							<span class={rowTile(selected)}>
								<SIcon size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{s.title}</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
									{s.lessonCount} lecke
								</span>
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
