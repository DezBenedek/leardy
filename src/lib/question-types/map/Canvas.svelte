<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MapBox } from '../types';
	import { boxArrowEnd } from './geometry';
	import { arrowContrast, readImagePixels, type ImagePixels } from './contrast';
	let { src, boxes, editable = false, disabled = false, selected = '', onSelect = () => {}, onMove = () => {}, field }: {
		src: string;
		boxes: Omit<MapBox, 'answer'>[];
		editable?: boolean;
		disabled?: boolean;
		selected?: string;
		onSelect?: (id: string) => void;
		onMove?: (id: string, point: { x: number; y: number }, arrow: boolean) => void;
		field: Snippet<[number]>;
	} = $props();
	const instanceId = $props.id();
	let failedSrc = $state('');
	let imageData = $state.raw<{ src: string; pixels: ImagePixels | null } | null>(null);
	const pixels = $derived(imageData?.src === src ? imageData.pixels : null);
	let size = $state({ width: 1, height: 1 });
	function measure(node: HTMLDivElement) {
		const observer = new ResizeObserver(() => { size = { width: node.clientWidth || 1, height: node.clientHeight || 1 }; });
		observer.observe(node);
		return () => observer.disconnect();
	}
	function drag(event: PointerEvent, box: Omit<MapBox, 'answer'>, arrow = false) {
		if (!editable || disabled || event.button !== 0) return;
		event.preventDefault();
		onSelect(box.id);
		const button = event.currentTarget as HTMLButtonElement;
		const canvas = button.closest('[data-map-canvas]')!.getBoundingClientRect();
		const origin = arrow ? box.arrow! : box;
		const start = { x: event.clientX, y: event.clientY, px: origin.x, py: origin.y };
		button.setPointerCapture(event.pointerId);
		function move(next: PointerEvent) {
			const x = start.px + (next.clientX - start.x) / canvas.width * 100;
			const y = start.py + (next.clientY - start.y) / canvas.height * 100;
			const minX = arrow ? 0 : box.width / 2;
			const minY = arrow ? 0 : Math.min(22 / canvas.height * 100, 50);
			onMove(box.id, { x: Math.max(minX, Math.min(100 - minX, x)), y: Math.max(minY, Math.min(100 - minY, y)) }, arrow);
		}
		function end() { button.removeEventListener('pointermove', move); button.removeEventListener('pointerup', end); button.removeEventListener('pointercancel', end); button.removeEventListener('lostpointercapture', end); }
		button.addEventListener('pointermove', move);
		button.addEventListener('pointerup', end);
		button.addEventListener('pointercancel', end);
		button.addEventListener('lostpointercapture', end);
	}
	function moveKey(event: KeyboardEvent, box: Omit<MapBox, 'answer'>, arrow = false) {
		const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
		if (!delta[event.key] || disabled) return;
		event.preventDefault();
		const point = arrow ? box.arrow! : box;
		const step = event.shiftKey ? 5 : 1;
		const minX = arrow ? 0 : box.width / 2;
		const minY = arrow ? 0 : Math.min(22 / size.height * 100, 50);
		onMove(box.id, { x: Math.max(minX, Math.min(100 - minX, point.x + delta[event.key][0] * step)), y: Math.max(minY, Math.min(100 - minY, point.y + delta[event.key][1] * step)) }, arrow);
	}
</script>

<div {@attach measure} data-map-canvas class="relative isolate w-full rounded-xl border border-stone-200 bg-stone-100 dark:border-white/15 dark:bg-white/5">
	<img {src} onerror={() => (failedSrc = src)} alt="A vaktérkép alapképe" draggable="false" onload={(event) => { failedSrc = ''; imageData = { src, pixels: readImagePixels(event.currentTarget as HTMLImageElement) }; }} referrerpolicy="no-referrer" class={['block h-auto w-full rounded-xl', failedSrc === src && 'min-h-32']} />
	{#if failedSrc === src}<p role="alert" class="absolute inset-0 grid place-items-center rounded-xl bg-stone-50 p-4 text-center text-sm text-stone-500 dark:bg-stone-900 dark:text-stone-400">A vaktérkép képe nem tölthető be.</p>{/if}
	<svg class="pointer-events-none absolute inset-0 size-full overflow-visible" style:mix-blend-mode={pixels ? 'normal' : 'difference'} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
		{#each boxes as box (box.id)}
			{#if box.arrow}
				{@const end = boxArrowEnd(box, size.width, size.height)}
				{@const start = { x: box.arrow.x * size.width / 100, y: box.arrow.y * size.height / 100 }}
				{@const stops = arrowContrast(pixels, start, end, size.width, size.height)}
				{@const gradientId = `${instanceId}-${box.id}-contrast`}
				{@const markerId = `${instanceId}-${box.id}-arrow`}
				<defs>
					<linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
						{#each stops as stop, index (index)}<stop offset={stop.offset} stop-color={stop.color} />{/each}
					</linearGradient>
					<marker id={markerId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill={stops.at(-1)?.color} /></marker>
				</defs>
				<line data-map-arrow={box.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={`url(#${gradientId})`} stroke-width="2" marker-end={`url(#${markerId})`} />
				<circle cx={start.x} cy={start.y} r="3" fill={stops[0].color} />
			{/if}
		{/each}
	</svg>
	{#each boxes as box, index (box.id)}
		<div class="absolute h-11 -translate-x-1/2 -translate-y-1/2" style:left={`${box.x}%`} style:top={`${box.y}%`} style:width={`${box.width}%`}>
			{#if editable}
				<button type="button" {disabled} aria-label={`${index + 1}. mező mozgatása`} aria-pressed={selected === box.id} onpointerdown={(event) => drag(event, box)} onclick={() => onSelect(box.id)} onkeydown={(event) => moveKey(event, box)} class={['flex size-full touch-none cursor-move items-center justify-center gap-1 overflow-hidden rounded-lg border-2 bg-white px-1 text-xs font-bold shadow-sm focus-visible:outline-2 focus-visible:outline-brand-500 dark:bg-stone-900 dark:text-white', selected === box.id ? 'border-brand-500 text-brand-700 ring-2 ring-brand-200 dark:text-brand-200' : 'border-stone-300 text-ink-900 dark:border-stone-500']}>
					{@render field(index)}
				</button>
			{:else}{@render field(index)}{/if}
		</div>
		{#if editable && box.arrow}
			<button type="button" {disabled} aria-label={`${index + 1}. nyílpont mozgatása`} onpointerdown={(event) => drag(event, box, true)} onkeydown={(event) => moveKey(event, box, true)} onclick={() => onSelect(box.id)} class="absolute z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 touch-none cursor-move place-items-center rounded-full border border-brand-500 bg-brand-50/90 text-xs font-bold text-brand-700 shadow-sm focus-visible:outline-2 focus-visible:outline-brand-500" style:left={`${box.arrow.x}%`} style:top={`${box.arrow.y}%`}>⊕</button>
		{/if}
	{/each}
</div>
