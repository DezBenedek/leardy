<script lang="ts">
	import type { QuestionEditorProps } from '../types';
	import { labelClass } from '../editor-styles';
	import '../editor.css';
	import { Check } from '@lucide/svelte';
	let { draft = $bindable(), saving, onChange }: QuestionEditorProps = $props();
	const id = $props.id();
</script>

<fieldset>
	<legend class="{labelClass} mb-1.5">Helyes válasz</legend>
	<div class="grid grid-cols-2 gap-2">
		{#each ['Igaz', 'Hamis'] as value (value)}
			<label class={['relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-bold', draft.correct_answer === value ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-stone-300 text-stone-500 dark:border-white/15 dark:text-stone-400']}>
				<input type="radio" name={`${id}-tf`} checked={draft.correct_answer === value} onchange={() => { draft.correct_answer = value; onChange(); }} disabled={saving} aria-label={value} class="peer absolute inset-0 size-full cursor-pointer opacity-0" />
				<span class="absolute inset-0 rounded-xl peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500"></span>
				{#if draft.correct_answer === value}<Check size={16} aria-hidden="true" />{/if}{value}
			</label>
		{/each}
	</div>
</fieldset>
