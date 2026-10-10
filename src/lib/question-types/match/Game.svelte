<script lang="ts">
	import { untrack } from 'svelte';
	import { Check, RotateCcw } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import type { GameProps } from '../../games/types';

	let { q, onAnswer, picked = null, correct = null }: GameProps = $props();
	let selected = $state<number | null>(untrack(() => q.leftOrder?.[0] ?? 0));
	let chosen = $state<Record<number, string>>({});
	const submitted = $derived(picked !== null);
	const lefts = $derived(q.lefts ?? []);
	const displayOrder = $derived(q.leftOrder ?? lefts.map((_, index) => index));
	const matches = $derived.by<Record<number, string>>(() => {
		if (picked === null) return chosen;
		try {
			const value: unknown = JSON.parse(picked);
			return Array.isArray(value) && value.every((item) => typeof item === 'string') ? { ...value } : chosen;
		} catch { return chosen; }
	});
	const count = $derived(lefts.filter((_, index) => matches[index] !== undefined).length);
	const pairColors = ['#2563eb', '#9333ea', '#0891b2', '#d97706', '#db2777', '#0d9488', '#ea580c', '#4f46e5'];
	type Point = { x: number; y: number };
	let geometry = $state.raw<{ width: number; height: number; left: Map<number, Point>; right: Map<string, Point> }>({ width: 0, height: 0, left: new Map(), right: new Map() });
	const correctItems = $derived.by<string[]>(() => {
		try {
			const value: unknown = JSON.parse(correct ?? 'null');
			return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
		} catch { return []; }
	});
	const connections = $derived(lefts.flatMap((_, index) => {
		const start = geometry.left.get(index);
		const end = geometry.right.get(matches[index]);
		if (!start || !end) return [];
		const bend = (end.x - start.x) * .5;
		return [{ index, start, end, color: pairColor(index), path: `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}` }];
	}));

	function observeBoard(node: HTMLDivElement) {
		let frame = 0;
		const observed = new Set<Element>();
		function measure() {
			frame = 0;
			const leftButtons = [...node.querySelectorAll<HTMLButtonElement>('[data-match-left]')];
			const rightButtons = [...node.querySelectorAll<HTMLButtonElement>('[data-match-right]')];
			const elements = new Set<Element>([node, ...leftButtons, ...rightButtons]);
			for (const element of observed) if (!elements.has(element)) { resizeObserver.unobserve(element); observed.delete(element); }
			for (const element of elements) if (!observed.has(element)) { resizeObserver.observe(element); observed.add(element); }
			const board = node.getBoundingClientRect();
			// A Drawer transzformációja mellett is helyi SVG-koordináták kellenek.
			const scaleX = board.width / node.offsetWidth || 1;
			const scaleY = board.height / node.offsetHeight || 1;
			const point = (button: HTMLButtonElement, side: 'left' | 'right'): Point => {
				const rect = button.getBoundingClientRect();
				return { x: (rect[side] - board.left) / scaleX, y: (rect.top + rect.height / 2 - board.top) / scaleY };
			};
			geometry = { width: node.offsetWidth, height: node.offsetHeight,
				left: new Map(leftButtons.map((button) => [Number(button.dataset.matchLeft), point(button, 'right')])),
				right: new Map(rightButtons.map((button) => [button.dataset.matchRight!, point(button, 'left')])) };
		}
		function scheduleMeasure() { if (!frame) frame = requestAnimationFrame(measure); }
		const resizeObserver = new ResizeObserver(scheduleMeasure);
		// Az újrakevert válaszok új gombokat is létrehozhatnak azonos mérettel.
		const mutationObserver = new MutationObserver(scheduleMeasure);
		mutationObserver.observe(node, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-match-left', 'data-match-right'] });
		scheduleMeasure();
		return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); mutationObserver.disconnect(); };
	}
	function pairColor(index: number): string {
		if (submitted && correctItems.length) return matches[index] === correctItems[index] ? 'var(--color-emerald-500)' : 'var(--color-red-500)';
		return pairColors[displayOrder.indexOf(index) % pairColors.length];
	}

	function pairWith(option: string) {
		if (submitted || selected === null) return;
		const next = { ...chosen };
		for (const index of Object.keys(next)) if (next[Number(index)] === option) delete next[Number(index)];
		next[selected] = option;
		chosen = next;
		selected = displayOrder.find((index) => next[index] === undefined) ?? null;
	}
	function leftTone(index: number): string {
		if (submitted && correctItems.length) return matches[index] === correctItems[index]
			? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
			: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200';
		return selected === index
			? 'border-brand-500 bg-brand-50 text-ink-900 ring-2 ring-brand-500/20 dark:bg-brand-500/10 dark:text-white'
			: 'border-stone-200 bg-white text-ink-900 dark:border-white/15 dark:bg-white/5 dark:text-white';
	}
	function submit() {
		if (!submitted && lefts.length > 0 && count === lefts.length) onAnswer(JSON.stringify(lefts.map((_, index) => chosen[index])));
	}

	function tone(opt: string): string {
		if (correct !== null && correct !== undefined && opt === correct) {
			return 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-400/10 dark:text-emerald-200';
		}
		if (picked !== null && picked !== undefined && opt === picked) {
			return 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-400/10 dark:text-red-200';
		}
		return 'border-dashed border-brand-500/30 bg-brand-50 text-ink-900 hover:border-brand-500 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-white dark:hover:bg-brand-500/20';
	}
</script>

{#if lefts.length}
	<div class="match-board relative grid grid-cols-2 items-start" {@attach observeBoard}>
		{#if geometry.width > 0 && geometry.height > 0}
			<svg class="match-connections pointer-events-none absolute inset-0 z-10 size-full overflow-visible" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true">
				{#each connections as connection (connection.index)}
					<path data-match-connection={connection.index} d={connection.path} fill="none" stroke={connection.color} stroke-width="3" stroke-linecap="round" />
					<circle cx={connection.start.x} cy={connection.start.y} r="4" fill={connection.color} />
					<circle cx={connection.end.x} cy={connection.end.y} r="4" fill={connection.color} />
				{/each}
			</svg>
		{/if}
		<div class="grid min-w-0 grid-cols-1 gap-2" aria-label="Bal oldali elemek">
			{#each displayOrder as index (index)}
				{@const left = lefts[index]}
				<button type="button" disabled={submitted} aria-pressed={selected === index} data-match-left={index}
					aria-label={matches[index] !== undefined ? `${left}, párja: ${matches[index]}` : left}
					onclick={() => (selected = index)}
					style:--pair-color={pairColor(index)}
					class={['match-item min-h-12 min-w-0 rounded-xl border-2 px-2 py-2.5 text-left text-sm font-bold break-words transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:px-3', leftTone(index), matches[index] !== undefined && 'is-paired']}>
					<span class="flex items-center gap-1.5"><span class={['pair-badge', matches[index] !== undefined && 'is-connected']} aria-hidden="true">{displayOrder.indexOf(index) + 1}</span><span class="min-w-0 flex-1">{left}</span></span>
					{#if submitted && correctItems.length && matches[index] !== correctItems[index]}<span class="mt-1 block text-xs font-medium">Helyes: {correctItems[index]}</span>{/if}
				</button>
			{/each}
		</div>
		<div class="grid min-w-0 grid-cols-1 gap-2" aria-label="Jobb oldali elemek">
			{#each q.options as option (option)}
				{@const pairedIndex = lefts.findIndex((_, pairIndex) => matches[pairIndex] === option)}
				<button type="button" disabled={submitted || selected === null} onclick={() => pairWith(option)} data-match-right={option}
					aria-pressed={pairedIndex >= 0} aria-label={pairedIndex >= 0 ? `${option}, párja: ${lefts[pairedIndex]}` : option}
					style:--pair-color={pairedIndex >= 0 ? pairColor(pairedIndex) : undefined}
					class={['match-item flex min-h-12 min-w-0 items-center gap-1.5 rounded-xl border-2 px-2 py-2.5 text-left text-sm font-semibold break-words text-ink-900 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:px-3 dark:text-white', pairedIndex >= 0 ? 'is-paired' : 'border-dashed border-stone-300 hover:border-brand-500 dark:border-white/20']}>
					<span class="min-w-0 flex-1">{option}</span>
					{#if pairedIndex >= 0}<span class="pair-badge is-connected" aria-hidden="true">{displayOrder.indexOf(pairedIndex) + 1}</span>{/if}
				</button>
			{/each}
		</div>
	</div>
	{#if !submitted}
		<div class="mt-3 flex gap-2">
			<Button variant="outline" disabled={!count} onclick={() => { chosen = {}; selected = displayOrder[0] ?? null; }}><RotateCcw size={16} aria-hidden="true" /> Újra</Button>
			<Button block disabled={count !== lefts.length} onclick={submit}><Check size={16} aria-hidden="true" /> Ellenőrzés ({count}/{lefts.length})</Button>
		</div>
	{/if}
{:else}
<!-- Egyetlen fogalom párosítása a szókártyás gyakorlásban. -->
<div class="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
	<div class="flex items-center justify-center rounded-xl bg-brand-600 px-3 py-4 text-center text-[16px] font-bold text-white">
		{q.left ?? q.question_text}
	</div>
	<div class="grid place-items-center text-xl font-extrabold text-stone-400">
		<span class="rotate-90 sm:rotate-0">→</span>
	</div>
	<div class="grid gap-2">
		{#each q.options as opt, i (`${i}:${opt}`)}
			<button
				type="button" disabled={submitted}
				onclick={() => onAnswer(opt)}
				class={['rounded-xl border-2 px-3 py-3 text-center text-[15px] font-semibold transition active:scale-[0.98]', tone(opt)]}
			>
				{opt}
			</button>
		{/each}
	</div>
</div>
{/if}

<style>
	.match-board { column-gap: clamp(48px, 14vw, 88px); }
	.match-item.is-paired { border-color: var(--pair-color); background: color-mix(in srgb, var(--pair-color) 8%, var(--color-white)); }
	:global(.dark) .match-item.is-paired { background: color-mix(in srgb, var(--pair-color) 16%, var(--color-stone-900)); }
	.pair-badge { display: grid; place-items: center; flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: var(--color-stone-100); color: var(--color-stone-500); font-size: 11px; font-weight: 800; }
	:global(.dark) .pair-badge { background: var(--color-stone-800); color: var(--color-stone-400); }
	.pair-badge.is-connected { background: var(--pair-color); color: white; }
	@media (prefers-reduced-motion: reduce) { .match-item { transition: none; } }
</style>
