<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Maximize2, Minimize2 } from '@lucide/svelte';
	import { loadSettings } from '$lib/settings';
	import IconButton from './IconButton.svelte';

	let { value = $bindable(''), disabled = false, label = 'Tartalom', placeholder = 'Írd ide a bekezdés tartalmát…' }: {
		value?: string; disabled?: boolean; label?: string; placeholder?: string;
	} = $props();
	const id = $props.id();
	let expanded = $state(false);
	onMount(() => { expanded = loadSettings().expandEditorTextareas; });

	function fit(node: HTMLTextAreaElement) {
		// A tartalom és a szélesség változásakor is újramérjük a teljes magasságot.
		const update = (full: boolean) => {
			const height = node.getBoundingClientRect().height;
			const transition = node.style.transition;
			const scrollTop = node.scrollTop;
			node.style.transition = 'none';
			node.style.height = 'auto';
			const target = full ? node.scrollHeight + node.offsetHeight - node.clientHeight : node.offsetHeight;
			// Mindkét végpont pixelérték, így becsukáskor is folyamatos az átmenet.
			node.style.height = `${height}px`;
			void node.offsetHeight;
			node.style.transition = transition;
			node.style.height = `${target}px`;
			node.scrollTop = scrollTop;
		};
		$effect(() => {
			void value;
			const full = expanded;
			untrack(() => update(full));
		});
		let width = node.clientWidth;
		const observer = new ResizeObserver(() => {
			if (width !== node.clientWidth) { width = node.clientWidth; update(expanded); }
		});
		observer.observe(node);
		return () => observer.disconnect();
	}
</script>

<div>
	<div class="mb-1 flex items-center justify-between gap-2">
		<label for={id} class="text-sm font-bold text-ink-900 dark:text-white">{label}</label>
		<IconButton ariaLabel={expanded ? 'Tartalommező összecsukása' : 'Tartalommező kinyitása'} size={32} {disabled} onclick={() => { expanded = !expanded; }}>
			<span class="relative block size-4" aria-hidden="true">
				<span class={['absolute inset-0 flex items-center justify-center transition-opacity duration-150 ease-out motion-reduce:transition-none', expanded ? 'opacity-0' : 'opacity-100']}>
					<Maximize2 size={16} />
				</span>
				<span class={['absolute inset-0 flex items-center justify-center transition-opacity duration-150 ease-out motion-reduce:transition-none', expanded ? 'opacity-100' : 'opacity-0']}>
					<Minimize2 size={16} />
				</span>
			</span>
		</IconButton>
	</div>
	<textarea
		{id} bind:value {@attach fit} {disabled} {placeholder} rows={5} spellcheck="true"
		class="block w-full resize-none overflow-y-auto rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm leading-6 font-normal text-ink-900 outline-none transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white"
		style:min-height="9rem"
	></textarea>
</div>
