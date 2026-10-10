<script lang="ts">
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import { untrack } from 'svelte';
	import type { GameProps } from '../games/types';
	import { answerItems, normalizeAnswer } from './shared';
	import { gapParts } from './gap/definition';
	import AnswerSlot from './AnswerSlot.svelte';
	import Canvas from './map/Canvas.svelte';
	import Button from '$lib/ui/Button.svelte';
	let { q, onAnswer, picked = null, correct = null }: GameProps = $props();
	const count = $derived(q.type === 'map' ? q.boxes?.length ?? 0 : gapParts(q.gapText ?? '').filter((part) => part.index !== undefined).length);
	let answers = $state<string[]>(untrack(() => Array.from({ length: count }, () => '')));
	let tokens = $state<(number | null)[]>(untrack(() => Array.from({ length: count }, () => null)));
	let selected = $state<number | null>(null);
	let dragPoint = $state<{ x: number; y: number; token: number } | null>(null);
	const submitted = $derived(picked !== null);
	const values = $derived(picked === null ? answers : answerItems(picked) ?? answers);
	const expected = $derived(correct === null ? null : answerItems(correct));
	const mode = $derived(q.mode ?? 'drag');
	const complete = $derived(values.filter((value) => value.trim()).length);
	function available(index: number) { return q.reusable || !tokens.includes(index); }
	function place(index: number, token = selected) {
		if (submitted) return;
		if (token === null) { answers[index] = ''; tokens[index] = null; return; }
		if (!available(token)) return;
		answers[index] = q.options[token];
		tokens[index] = token;
		selected = null;
	}
	function startDrag(event: PointerEvent, token: number) {
		if (submitted || event.button !== 0) return;
		const button = event.currentTarget as HTMLButtonElement;
		const start = { x: event.clientX, y: event.clientY };
		button.setPointerCapture(event.pointerId);
		let moved = false;
		function move(next: PointerEvent) {
			if (!moved && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 5) return;
			moved = true;
			dragPoint = { x: next.clientX, y: next.clientY, token };
		}
		function end(next: PointerEvent) {
			if (moved && next.type === 'pointerup') {
				const root = button.closest('[data-fill-game]');
				const target = document.elementFromPoint(next.clientX, next.clientY)?.closest('[data-fill-slot]');
				if (target && root?.contains(target)) { place(Number(target.getAttribute('data-fill-slot')), token); button.addEventListener('click', (click) => click.stopImmediatePropagation(), { once: true, capture: true }); }
			}
			dragPoint = null;
			button.removeEventListener('pointermove', move);
			button.removeEventListener('pointerup', end);
			button.removeEventListener('pointercancel', end);
			button.removeEventListener('lostpointercapture', end);
		}
		button.addEventListener('pointermove', move);
		button.addEventListener('pointerup', end);
		button.addEventListener('pointercancel', end);
		button.addEventListener('lostpointercapture', end);
	}
</script>

{#snippet field(index: number)}
	<AnswerSlot {index} {mode} value={values[index] ?? ''} options={[...new Set(q.options)]} disabled={submitted} active={selected !== null} verdict={submitted && expected ? normalizeAnswer(values[index] ?? '') === normalizeAnswer(expected[index] ?? '') : undefined} onChange={(value) => (answers[index] = value)} onPlace={() => place(index)} />
{/snippet}

<div data-fill-game class="space-y-4">
	{#if q.type === 'map' && q.imageUrl}
		<Canvas src={q.imageUrl} boxes={q.boxes ?? []} {field} />
	{:else}
		<div class="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-base leading-[3.5] whitespace-pre-wrap text-ink-900 dark:border-white/10 dark:bg-white/5 dark:text-white">
			{#each gapParts(q.gapText ?? '') as part, index (index)}
				{#if part.index !== undefined}<span class="mx-1 inline-block h-11 w-40 max-w-full align-middle">{@render field(part.index)}</span>{:else}{part.text}{/if}
			{/each}
		</div>
	{/if}
	{#if mode === 'drag'}
		<div class="flex min-h-12 flex-wrap items-center gap-2 rounded-xl bg-stone-50 p-2 dark:bg-white/5" role="group" aria-label="Behúzható szavak">
			{#each q.options as option, token (token)}
				{#if available(token)}
					<button type="button" disabled={submitted} aria-pressed={selected === token} onpointerdown={(event) => startDrag(event, token)} onclick={() => (selected = selected === token ? null : token)} class={['min-h-11 max-w-full touch-none rounded-lg border-2 px-3 py-2 text-sm font-bold break-words', selected === token ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'border-stone-200 bg-white text-ink-900 dark:border-white/15 dark:bg-stone-900 dark:text-white']}>{option}</button>
				{/if}
			{/each}
			{#if !q.reusable && tokens.filter((token) => token !== null).length === q.options.length}<span class="text-xs text-stone-500">Minden szót elhelyeztél.</span>{/if}
		</div>
	{/if}
	{#if !submitted}<Button block disabled={complete !== count || count === 0} onclick={() => onAnswer(JSON.stringify(answers.map((value) => value.trim())))}>Ellenőrzés ({complete}/{count})</Button>{/if}
</div>
{#if dragPoint}<div use:portal><div class="pointer-events-none fixed z-[99999] max-w-60 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-brand-500 bg-white px-3 py-2 text-sm font-bold text-brand-700 shadow-lg" style:left={`${dragPoint.x}px`} style:top={`${dragPoint.y}px`}>{q.options[dragPoint.token]}</div></div>{/if}
