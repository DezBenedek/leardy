<script lang="ts" module>
	import type { FontFamilyChoice } from '$lib/settings';

	export const fontFamilyStacks: Record<FontFamilyChoice, string> = {
		system: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
		modern: "'Bricolage Grotesque', 'Inter', ui-sans-serif, system-ui, sans-serif",
		book: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif",
		excalifont: "'Excalifont', ui-sans-serif, system-ui, sans-serif"
	};
</script>

<script lang="ts">
	import { Check, ChevronDown, Search, X } from '@lucide/svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { portal } from './SubjectPicker.svelte';

	/* Betűtípus-választó a Tantárgyválasztó mintájára: vékony kártyagomb,
	   Sheetben nyíló, kereshető opciólista. Drawer belsejéből is használható. */

	interface Props {
		value?: FontFamilyChoice;
		label?: string;
	}

	let { value = $bindable('system' as FontFamilyChoice), label = 'Betűtípus' }: Props = $props();

	let open = $state(false);
	let query = $state('');

	const options: { id: FontFamilyChoice; label: string }[] = [
		{ id: 'system', label: 'Rendszer' },
		{ id: 'modern', label: 'Modern' },
		{ id: 'book', label: 'Könyvszerű' },
		{ id: 'excalifont', label: 'Excalifont' }
	];

	let active = $derived(options.find((o) => o.id === value) ?? options[0]);
	let filtered = $derived(
		options.filter((o) => o.label.toLocaleLowerCase('hu').includes(query.trim().toLocaleLowerCase('hu')))
	);

	const pickerBtn =
		'flex min-w-0 w-full items-center gap-2 rounded-2xl border border-stone-300 bg-white px-3 py-2 text-left transition outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/15 dark:bg-white/5 dark:focus:ring-brand-500/20 dark:hover:bg-white/5';

	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';

	function pick(id: FontFamilyChoice) {
		value = id;
		open = false;
		query = '';
	}
</script>

<button
	type="button"
	class={pickerBtn}
	aria-haspopup="dialog"
	onclick={() => {
		query = '';
		open = true;
	}}
>
	<span class="min-w-0 flex-1">
		<span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">
			{label}
		</span>
		<span
			class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white"
			style="font-family: {fontFamilyStacks[value]}"
		>
			{active.label}
		</span>
	</span>
	<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
</button>

<!-- Mindig mountolva: a Sheet sajat open allapota vezerli a becsukas animaciot is. -->
<div use:portal>
	<Sheet {open} label="{label} választása" title={label} onClose={() => (open = false)}>
			<div class="relative mt-2">
				<Search
					size={16}
					class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-400 dark:text-stone-500"
					aria-hidden="true"
				/>
				<input
					type="text"
					bind:value={query}
					placeholder="Keresés…"
					aria-label="Keresés"
					autocomplete="off"
					class="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pr-10 pl-10 text-[14px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:bg-white/5 dark:focus:ring-brand-500/20"
				/>
				{#if query}
					<button
						type="button"
						onclick={() => (query = '')}
						aria-label="Keresés törlése"
						class="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
					>
						<X size={15} />
					</button>
				{/if}
			</div>
			<ul class="-mx-1 mt-2 space-y-0.5">
				{#each filtered as o (o.id)}
					{@const selected = o.id === value}
					<li>
						<button
							type="button"
							aria-pressed={selected}
							onclick={() => pick(o.id)}
							class={[rowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
						>
							<span
								aria-hidden="true"
								class={[
									'grid size-9 shrink-0 place-items-center rounded-xl text-[19px] font-extrabold',
									selected
										? 'bg-brand-500 text-white'
										: 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300'
								].join(' ')}
								style="font-family: {fontFamilyStacks[o.id]}"
							>
								Aa
							</span>
							<span
								class="min-w-0 flex-1 truncate text-[15px] font-extrabold text-ink-900 dark:text-white"
								style="font-family: {fontFamilyStacks[o.id]}"
							>
								{o.label}
							</span>
							{#if selected}
								<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
							{/if}
						</button>
					</li>
				{:else}
					<li class="px-2 py-6 text-center text-[14px] text-stone-400 dark:text-stone-500">
						Nincs ilyen betűtípus.
					</li>
			{/each}
		</ul>
	</Sheet>
</div>
