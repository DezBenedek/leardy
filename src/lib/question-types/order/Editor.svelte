<script lang="ts">
	import type { QuestionEditorProps } from '../types';
	import { labelClass, addClass } from '../editor-styles';
	import '../editor.css';
	import { ArrowDown, ArrowUp, Plus } from '@lucide/svelte';
	import RemoveButton from '../RemoveButton.svelte';
	let { draft = $bindable(), saving, onChange }: QuestionEditorProps = $props();
	const id = $props.id();
	function updateOption(index: number, value: string) { draft.options[index] = value; onChange(); }
	function removeOption(index: number) { if (draft.options.length > 2) draft.options = draft.options.filter((_, i) => i !== index); onChange(); }
	function addOption() { if (draft.options.length < 8) draft.options.push(''); onChange(); }
	function moveItem(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= draft.options.length) return;
		[draft.options[index], draft.options[target]] = [draft.options[target], draft.options[index]];
		onChange();
	}
</script>

<fieldset class="min-w-0">
	<legend class="{labelClass} mb-1.5">Helyes sorrend</legend>
	<div class="space-y-1.5">
		{#each draft.options as option, i (i)}
			<div class="answer-row flex min-h-11 items-center gap-1 rounded-xl border border-stone-300 px-1 dark:border-white/15">
				<span class="w-6 shrink-0 text-center text-xs font-bold text-stone-400">{i + 1}</span>
				<label for={`${id}-item-${i}`} class="sr-only">{i + 1}. elem</label>
				<input id={`${id}-item-${i}`} class="row-input" value={option} oninput={(event) => updateOption(i, event.currentTarget.value)} maxlength={200} placeholder="{i + 1}. elem" disabled={saving} />
				<button type="button" aria-label="{i + 1}. elem feljebb" title="Feljebb" disabled={saving || i === 0} onclick={() => moveItem(i, -1)} class="row-button text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/10"><ArrowUp size={15} aria-hidden="true" /></button>
				<button type="button" aria-label="{i + 1}. elem lejjebb" title="Lejjebb" disabled={saving || i === draft.options.length - 1} onclick={() => moveItem(i, 1)} class="row-button text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/10"><ArrowDown size={15} aria-hidden="true" /></button>
				<RemoveButton label={`${i + 1}. elem törlése`} disabled={saving || draft.options.length <= 2} onclick={() => removeOption(i)} />
			</div>
		{/each}
	</div>
	{#if draft.options.length < 8}<button type="button" disabled={saving} onclick={addOption} class={addClass}><Plus size={14} aria-hidden="true" /> Elem hozzáadása</button>{/if}
</fieldset>
