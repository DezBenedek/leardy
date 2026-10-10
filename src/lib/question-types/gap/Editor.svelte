<script lang="ts">
	import { tick } from 'svelte';
	import { TextCursorInput } from '@lucide/svelte';
	import type { QuestionEditorProps } from '../types';
	import { gapParts, gapAnswers } from './definition';
	import { fieldClass, labelClass } from '../editor-styles';
	import FillSettings from '../FillSettings.svelte';
	import Collapse from '$lib/ui/Collapse.svelte';
	let { draft = $bindable(), saving, onChange }: QuestionEditorProps = $props();
	const id = $props.id();
	const text = $derived(draft.settings?.text ?? '');
	const parts = $derived(gapParts(text));
	let textarea: HTMLTextAreaElement | undefined;
	function remember(node: HTMLTextAreaElement) { textarea = node; return () => { textarea = undefined; }; }
	async function markGap() {
		if (!textarea || saving) return;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const word = text.slice(start, end) || 'szó';
		draft.settings = { ...draft.settings, text: `${text.slice(0, start)}[[${word}]]${text.slice(end)}` };
		onChange();
		await tick();
		textarea?.focus();
		textarea?.setSelectionRange(start + 2, start + 2 + word.length);
	}
</script>

<FillSettings bind:draft {saving} {onChange}>
<div class="space-y-1.5">
	<div class="flex items-center justify-between gap-2">
		<label for={`${id}-text`} class={labelClass}>Hiányos szöveg <span aria-hidden="true" class="text-xs font-normal text-stone-500">{gapAnswers(text).length} kihagyás</span></label>
		<button type="button" disabled={saving} onpointerdown={(event) => event.preventDefault()} onclick={markGap} class="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:text-brand-200 dark:hover:bg-brand-500/10"><TextCursorInput size={14} aria-hidden="true" /> Kihagyás jelölése</button>
	</div>
	<textarea {@attach remember} id={`${id}-text`} class="{fieldClass} min-h-36 resize-y" rows={5} maxlength={6000} value={text} disabled={saving} oninput={(event) => { draft.settings = { ...draft.settings, text: event.currentTarget.value }; onChange(); }} placeholder="A [[Duna]] Magyarország egyik folyója."></textarea>
	<Collapse open={!!text}>
		<div class="rounded-xl bg-stone-50 p-3 dark:bg-white/5">
			<p class="text-sm leading-loose whitespace-pre-wrap text-ink-900 dark:text-white">{#each parts as part, index (index)}{#if part.index !== undefined}<span class="mx-0.5 inline-block rounded-md border border-dashed border-brand-400 bg-brand-50 px-2 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">{part.index + 1}. {part.text || '…'}</span>{:else}{part.text}{/if}{/each}</p>
		</div>
	</Collapse>
</div>
</FillSettings>
