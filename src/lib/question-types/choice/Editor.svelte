<script lang="ts">
	import type { QuestionEditorProps } from '../types';
	import { labelClass, addClass } from '../editor-styles';
	import '../editor.css';
	import { untrack } from 'svelte';
	import { Check, Plus } from '@lucide/svelte';
	import RemoveButton from '../RemoveButton.svelte';
	let { draft = $bindable(), saving, onChange }: QuestionEditorProps = $props();
	const id = $props.id();
	let selectedIndex = $state(untrack(() => draft.correct_answer.trim() ? draft.options.findIndex((option) => option.trim() === draft.correct_answer.trim()) : -1));
	function updateOption(index: number, value: string) {
		draft.options[index] = value;
		if (index === selectedIndex) draft.correct_answer = value.trim();
		onChange();
	}
	function removeOption(index: number) {
		if (draft.options.length <= 2) return;
		draft.options = draft.options.filter((_, i) => i !== index);
		if (selectedIndex === index) { selectedIndex = -1; draft.correct_answer = ''; }
		else if (selectedIndex > index) selectedIndex--;
		onChange();
	}
	function selectAnswer(index: number) { selectedIndex = index; draft.correct_answer = draft.options[index].trim(); onChange(); }
	function addOption() { if (draft.options.length < 8) draft.options.push(''); onChange(); }
</script>

<fieldset class="min-w-0">
	<legend class="{labelClass} mb-1.5">Válaszok</legend>
	<div class="space-y-1.5">
		{#each draft.options as option, i (i)}
			<div class={['answer-row flex min-h-11 items-center rounded-xl border pr-1', selectedIndex === i ? 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-500/50 dark:bg-emerald-500/10' : 'border-stone-300 dark:border-white/15']}>
				<label class="relative grid size-10 shrink-0 cursor-pointer place-items-center" title="Helyes válasz">
					<input type="radio" name={`${id}-correct`} checked={selectedIndex === i} onchange={() => selectAnswer(i)} disabled={saving} aria-label="{i + 1}. lehetőség a helyes válasz" class="peer absolute inset-0 size-full cursor-pointer opacity-0" />
					<span class={['grid size-6 place-items-center rounded-full border text-[11px] font-bold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500', selectedIndex === i ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 text-stone-400 dark:border-white/20']}>
						{#if selectedIndex === i}<Check size={14} strokeWidth={3} aria-hidden="true" />{:else}{String.fromCharCode(65 + i)}{/if}
					</span>
				</label>
				<label for={`${id}-option-${i}`} class="sr-only">{i + 1}. válaszlehetőség</label>
				<input id={`${id}-option-${i}`} class="row-input" value={option} oninput={(event) => updateOption(i, event.currentTarget.value)} maxlength={200} placeholder="{i + 1}. válasz" disabled={saving} />
				<RemoveButton label={`${i + 1}. lehetőség törlése`} disabled={saving || draft.options.length <= 2} onclick={() => removeOption(i)} />
			</div>
		{/each}
	</div>
	{#if draft.options.length < 8}<button type="button" disabled={saving} onclick={addOption} class={addClass}><Plus size={14} aria-hidden="true" /> Válasz hozzáadása</button>{/if}
</fieldset>
