<script lang="ts">
	import { AlertCircle, ChevronDown, Eye, LayoutTemplate, Save } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import ActionMenu from '$lib/ui/ActionMenu.svelte';
	import SectionPicker from './SectionPicker.svelte';
	import QuestionImage from './QuestionImage.svelte';
	import QuestionImagePicker from './QuestionImagePicker.svelte';
	import { editorFor } from '$lib/question-types/components';
	import { questionType } from '$lib/question-types/registry';
	import { fieldClass, labelClass } from '$lib/question-types/editor-styles';
	import { questionTypeTitle, type QuestionDraft, type SectionOption } from '$lib/quiz-editor';

	interface Props {
		draft: QuestionDraft;
		sections: SectionOption[];
		saving: boolean;
		imageUploading?: boolean;
		error: string;
		onChange: () => void;
		onPickType: () => void;
		onPickTemplate: () => void;
		onSaveTemplate: () => void;
		onSave: () => void;
		onPreview: () => void;
		uploadImage?: (file: File) => Promise<string>;
		onImageBusyChange?: (busy: boolean) => void;
	}
	let { draft = $bindable(), sections, saving, imageUploading = false, error, onChange, onPickType, onPickTemplate, onSaveTemplate, onSave, onPreview, uploadImage, onImageBusyChange = () => {} }: Props = $props();
	const id = $props.id();
	const TypeEditor = $derived(editorFor(draft.type));
	let errorElement: HTMLDivElement | undefined = $state();
	$effect(() => { if (error) errorElement?.focus(); });
</script>

<form onsubmit={(event) => { event.preventDefault(); onSave(); }} class="space-y-3" novalidate aria-describedby={error ? `${id}-error` : undefined}>
	{#if error}
		<div bind:this={errorElement} id={`${id}-error`} role="alert" tabindex="-1" class="flex gap-2 rounded-xl bg-red-50 p-2.5 text-sm text-red-700 outline-none dark:bg-red-500/10 dark:text-red-300">
			<AlertCircle size={17} class="shrink-0" aria-hidden="true" /><span>{error}</span>
		</div>
	{/if}

	<div class={['grid gap-2', sections.length || draft.sectionSlug ? 'grid-cols-2' : 'grid-cols-1']}>
		<button type="button" disabled={saving} onclick={onPickType} aria-haspopup="dialog" class="flex min-w-0 items-center gap-2 rounded-2xl border border-stone-300 px-3 py-2 text-left disabled:opacity-60 dark:border-white/15 dark:bg-white/5">
			<span class="min-w-0 flex-1"><span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">Típus</span><span class="block truncate text-sm font-extrabold text-ink-900 dark:text-white">{questionTypeTitle(draft.type)}</span></span><ChevronDown size={16} class="shrink-0 text-stone-400" aria-hidden="true" />
		</button>
		{#if sections.length || draft.sectionSlug}
			<SectionPicker bind:value={draft.sectionSlug} {sections} label="Bekezdés" placeholder="Teljes lecke" disabled={saving} onchange={onChange} />
		{/if}
	</div>

	<div>
		<div class="mb-1 flex items-center justify-between gap-2">
			<label for={`${id}-question`} class={labelClass}>Kérdés</label>
			<div class="flex items-center gap-1">
				<span class="text-[10px] text-stone-400 tabular-nums">{draft.question_text.length}/1000</span>
				<QuestionImagePicker value={draft.imageUrl} disabled={saving} {uploadImage} onBusyChange={onImageBusyChange} onChange={(url) => { draft.imageUrl = url; onChange(); }} />
			</div>
		</div>
		<textarea id={`${id}-question`} class="{fieldClass} block min-h-18 resize-y leading-6" value={draft.question_text} oninput={(event) => { draft.question_text = event.currentTarget.value; onChange(); }} maxlength={1000} rows={2} placeholder={questionType(draft.type).questionPlaceholder} disabled={saving} spellcheck="true"></textarea>
	</div>
	<QuestionImage src={draft.imageUrl} />

	<TypeEditor bind:draft {saving} {onChange} />

	<div class="sticky bottom-0 z-10 flex items-center gap-2 border-t border-stone-100 bg-white pt-2 dark:border-white/10 dark:bg-stone-900">
		<ActionMenu compact floating align="start" label="Kérdés további műveletei" disabled={saving} actions={[
			{ id: 'load-template', label: 'Saját sablon betöltése', icon: LayoutTemplate, onclick: onPickTemplate },
			{ id: 'save-template', label: 'Mentés saját sablonként', icon: Save, onclick: onSaveTemplate }
		]} />
		<div class="flex-1"></div>
		<Button variant="outline" disabled={saving} onclick={onPreview}><Eye size={16} aria-hidden="true" /> Előnézet</Button>
		<Button type="submit" busy={saving && !imageUploading} disabled={imageUploading}><Save size={16} aria-hidden="true" /> {saving && !imageUploading ? 'Mentés…' : 'Mentés'}</Button>
	</div>
</form>
