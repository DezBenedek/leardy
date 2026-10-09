<script lang="ts">
	interface Props {
		text: string;
		lines?: number;
		wrap?: boolean;
		class?: string;
	}
	let { text, lines = 2, wrap = true, class: className = '' }: Props = $props();
	let overflowing = $state(false);
	let more = $state(false);
	const lineCount = $derived(Math.max(1, Math.floor(lines) || 1));

	function measure(node: HTMLSpanElement) {
		text;
		wrap;
		lines;
		node.scrollTop = 0;
		node.scrollLeft = 0;
		const update = () => {
			overflowing = node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
			more = wrap
				? node.scrollTop + node.clientHeight < node.scrollHeight - 1
				: node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
		};
		const observer = new ResizeObserver(update);
		observer.observe(node);
		if (node.firstElementChild) observer.observe(node.firstElementChild);
		node.addEventListener('scroll', update, { passive: true });
		update();
		return () => { observer.disconnect(); node.removeEventListener('scroll', update); };
	}
</script>

<span class={['scrollable-text', className]} style:--lines={lineCount}>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (A görgethető szöveg billentyűzettel is olvasható.) -->
	<span
		{@attach measure}
		data-scrollable-text
		class={['text-viewport', !wrap && 'nowrap']}
		tabindex={overflowing ? 0 : undefined}
		role="region"
		aria-label={text}
		title={overflowing ? 'A teljes szöveg görgetéssel olvasható.' : undefined}
	><span class="text-content">{text}</span></span>
	{#if more}<span class="ellipsis" aria-hidden="true">…</span>{/if}
</span>

<style>
	.scrollable-text { position: relative; display: block; min-width: 0; max-width: 100%; overflow: hidden; }
	.text-viewport { display: block; max-height: calc(var(--lines) * 1lh); overflow: auto; overflow-wrap: anywhere; overscroll-behavior: contain; scrollbar-width: thin; border-radius: 2px; }
	.text-content { display: block; }
	.nowrap { white-space: nowrap; overflow-wrap: normal; }
	.text-viewport:focus-visible { outline: 2px solid var(--color-brand-500); outline-offset: -2px; }
	.ellipsis { pointer-events: none; position: absolute; right: 0; bottom: 0; padding-left: 0.6em; background: linear-gradient(to right, transparent, var(--scrollable-text-background, white) 35%); }
	:global(.dark) .ellipsis { background: linear-gradient(to right, transparent, var(--scrollable-text-background, var(--color-stone-900)) 35%); }
</style>
