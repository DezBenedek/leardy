<script lang="ts">
	import type { QuestionEditorProps } from '../types';
	import { labelClass, addClass } from '../editor-styles';
	import { answerItems } from '../shared';
	import '../editor.css';
	import { untrack } from 'svelte';
	import { Check, Plus } from '@lucide/svelte';
	import RemoveButton from '../RemoveButton.svelte';
	let { draft = $bindable(), saving, onChange }: QuestionEditorProps = $props();
	const id = $props.id();
	const multiple = $derived(draft.settings?.multiple ?? false);
	let selected = $state<number[]>(untrack(() => {
		const answers = draft.settings?.multiple ? answerItems(draft.correct_answer) ?? [] : [draft.correct_answer.trim()].filter(Boolean);
		return draft.options.flatMap((option, index) => answers.includes(option.trim()) ? [index] : []);
	}));
	function sync() {
		const answers = selected.map((index) => draft.options[index].trim());
		draft.correct_answer = multiple ? JSON.stringify(answers) : answers[0] ?? '';
		onChange();
	}
	function setMode(value: boolean) {
		draft.settings = { ...draft.settings, multiple: value };
		if (!value) selected = selected.slice(0, 1);
		sync();
	}
	function updateOption(index: number, value: string) { draft.options[index] = value; sync(); }
	function removeOption(index: number) {
		if (draft.options.length <= 2) return;
		draft.options = draft.options.filter((_, i) => i !== index);
		selected = selected.filter((item) => item !== index).map((item) => item > index ? item - 1 : item);
		sync();
	}
	function selectAnswer(index: number) {
		selected = multiple ? selected.includes(index) ? selected.filter((item) => item !== index) : [...selected, index] : [index];
		sync();
	}
	function addOption() { if (draft.options.length < 8) draft.options.push(''); onChange(); }
</script>

<fieldset disabled={saving} class="min-w-0 space-y-3">
	<legend class="sr-only">Feleletválasztós beállításai</legend>
	<div class="grid grid-cols-2 gap-2" role="group" aria-label="Helyes válaszok száma">
		{#each [{ multiple: false, title: 'Egy jó válasz' }, { multiple: true, title: 'Több jó válasz' }] as mode (mode.title)}
			<button type="button" aria-pressed={multiple === mode.multiple} onclick={() => setMode(mode.multiple)} class={['min-h-11 rounded-xl border px-3 py-2 text-sm font-bold disabled:opacity-50', multiple === mode.multiple ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'border-stone-300 text-stone-500 dark:border-white/15 dark:text-stone-400']}>{mode.title}</button>
		{/each}
	</div>
	<div>
		<p class="{labelClass} mb-1.5">Válaszok</p>
		<div class="space-y-1.5">
			{#each draft.options as option, i (i)}
				<div class={['answer-row flex min-h-11 items-center rounded-xl border pr-1', selected.includes(i) ? 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-500/50 dark:bg-emerald-500/10' : 'border-stone-300 dark:border-white/15']}>
					<label class="relative grid size-10 shrink-0 cursor-pointer place-items-center" title="Helyes válasz">
						<input type={multiple ? 'checkbox' : 'radio'} name={`${id}-correct`} checked={selected.includes(i)} onchange={() => selectAnswer(i)} aria-label="{i + 1}. lehetőség a helyes válasz" class="peer absolute inset-0 size-full cursor-pointer opacity-0" />
						<span class={['grid size-6 place-items-center border text-[11px] font-bold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500', multiple ? 'rounded-md' : 'rounded-full', selected.includes(i) ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 text-stone-400 dark:border-white/20']}>
							{#if selected.includes(i)}<Check size={14} strokeWidth={3} aria-hidden="true" />{:else}{String.fromCharCode(65 + i)}{/if}
						</span>
					</label>
					<label for={`${id}-option-${i}`} class="sr-only">{i + 1}. válaszlehetőség</label>
					<input id={`${id}-option-${i}`} class="row-input" value={option} oninput={(event) => updateOption(i, event.currentTarget.value)} maxlength={200} placeholder="{i + 1}. válasz" />
					<RemoveButton label={`${i + 1}. lehetőség törlése`} disabled={draft.options.length <= 2} onclick={() => removeOption(i)} />
				</div>
			{/each}
		</div>
		{#if draft.options.length < 8}<button type="button" onclick={addOption} class={addClass}><Plus size={14} aria-hidden="true" /> Válasz hozzáadása</button>{/if}
	</div>
</fieldset>
