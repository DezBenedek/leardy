<script lang="ts">
	import type { QuestionEditorProps } from '../types';
	import { fieldClass, labelClass, addClass } from '../editor-styles';
	import '../editor.css';
	import { Plus } from '@lucide/svelte';
	import RemoveButton from '../RemoveButton.svelte';
	let { draft = $bindable(), saving, onChange }: QuestionEditorProps = $props();
	function addPair() { if (draft.pairs.length < 8) draft.pairs.push({ left: '', right: '' }); onChange(); }
	function removePair(index: number) { if (draft.pairs.length > 2) draft.pairs = draft.pairs.filter((_, i) => i !== index); onChange(); }
</script>

<fieldset class="min-w-0">
	<legend class="{labelClass} mb-1.5">Párok</legend>
	<div class="space-y-1.5">
		{#each draft.pairs as pair, i (i)}
			<div class="flex min-w-0 items-center gap-1.5">
				<input class={fieldClass} value={pair.left} oninput={(event) => { pair.left = event.currentTarget.value; onChange(); }} maxlength={200} placeholder="Bal oldal" disabled={saving} aria-label="{i + 1}. pár bal oldala" />
				<span class="text-xs text-stone-400" aria-hidden="true">→</span>
				<input class={fieldClass} value={pair.right} oninput={(event) => { pair.right = event.currentTarget.value; onChange(); }} maxlength={200} placeholder="Jobb oldal" disabled={saving} aria-label="{i + 1}. pár jobb oldala" />
				<RemoveButton label={`${i + 1}. pár törlése`} disabled={saving || draft.pairs.length <= 2} onclick={() => removePair(i)} />
			</div>
		{/each}
	</div>
	{#if draft.pairs.length < 8}<button type="button" disabled={saving} onclick={addPair} class={addClass}><Plus size={14} aria-hidden="true" /> Pár hozzáadása</button>{/if}
</fieldset>
