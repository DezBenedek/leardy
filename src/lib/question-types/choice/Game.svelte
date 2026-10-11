<script lang="ts">
	import { Check } from '@lucide/svelte';
	import type { GameProps } from '../../games/types';
	import { answerItems } from '../shared';
	import Button from '$lib/ui/Button.svelte';
	let { q, onAnswer, picked = null, correct = null }: GameProps = $props();
	let selected = $state<string[]>([]);
	const submitted = $derived(picked !== null);
	const expected = $derived(correct === null ? [] : q.multiple ? answerItems(correct) ?? [] : [correct]);
	const chosen = $derived(picked === null ? selected : q.multiple ? answerItems(picked) ?? [] : [picked]);
	function choose(option: string) {
		if (submitted) return;
		if (!q.multiple) { onAnswer(option); return; }
		selected = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
	}
	function tone(option: string): string {
		if (submitted && expected.includes(option)) return 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200';
		if (submitted && chosen.includes(option) && correct !== null) return 'border-red-500 bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-200';
		if (chosen.includes(option)) return 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200';
		return 'border-stone-200 bg-white text-ink-900 hover:border-brand-500 dark:border-white/10 dark:bg-transparent dark:text-white';
	}
</script>

<div class="grid gap-2">
	{#if q.multiple}<p class="text-sm text-stone-500 dark:text-stone-400">Több válasz is helyes lehet.</p>{/if}
	{#each q.options as option, i (`${i}:${option}`)}
		<button type="button" disabled={submitted} aria-pressed={chosen.includes(option)} onclick={() => choose(option)} class={['flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-[15px] font-medium transition', tone(option)]}>
			{#if q.multiple}<span class="grid size-5 shrink-0 place-items-center rounded border border-current">{#if chosen.includes(option)}<Check size={14} aria-hidden="true" />{/if}</span>{/if}
			{option}
		</button>
	{/each}
	{#if q.multiple && !submitted}<Button block disabled={!selected.length} onclick={() => onAnswer(JSON.stringify(selected))}>Ellenőrzés</Button>{/if}
</div>
