<script lang="ts">
	import { ImagePlus, Link, LoaderCircle, Trash2, Upload } from '@lucide/svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { fieldClass, labelClass } from '$lib/question-types/editor-styles';
	import { MAX_QUESTION_IMAGE_BYTES, normalizeQuestionImageUrl, QUESTION_IMAGE_TYPES } from '$lib/question-image';

	let { value = '', disabled = false, uploadImage, onChange, onBusyChange }: {
		value?: string;
		disabled?: boolean;
		uploadImage?: (file: File) => Promise<string>;
		onChange: (url: string) => void;
		onBusyChange: (busy: boolean) => void;
	} = $props();
	const id = $props.id();
	let open = $state(false);
	let urlValue = $state('');
	let uploading = $state(false);
	let error = $state('');
	function show() { urlValue = value; error = ''; open = true; }
	function applyUrl() {
		if (uploading || disabled) return;
		const url = normalizeQuestionImageUrl(urlValue);
		if (!url) { error = 'Adj meg érvényes HTTP- vagy HTTPS-kép-URL-t.'; return; }
		onChange(url);
		open = false;
	}
	async function chooseFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !uploadImage || uploading || disabled) return;
		error = '';
		if (file.size > MAX_QUESTION_IMAGE_BYTES) { error = 'A kép legfeljebb 10 MB lehet.'; return; }
		if (!file.size) { error = 'A kiválasztott fájl üres.'; return; }
		if (file.type && !QUESTION_IMAGE_TYPES.includes(file.type)) { error = 'JPEG, PNG, WebP, GIF vagy AVIF képet válassz.'; return; }
		uploading = true;
		onBusyChange(true);
		try {
			const url = normalizeQuestionImageUrl(await uploadImage(file));
			if (!url) throw new Error('A feltöltés érvénytelen képhivatkozást adott vissza.');
			onChange(url);
			open = false;
		} catch (problem) {
			error = problem instanceof Error ? problem.message : 'A kép feltöltése nem sikerült. Próbáld újra.';
			open = true;
		} finally { uploading = false; onBusyChange(false); }
	}
</script>

<button type="button" onclick={show} disabled={disabled || uploading} aria-label={value ? 'Kérdés képének módosítása' : 'Kép hozzáadása a kérdéshez'}
	title={value ? 'Kérdés képének módosítása' : 'Kép hozzáadása'} aria-haspopup="dialog"
	class={['grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50 dark:hover:bg-brand-500/10', value ? 'text-brand-600 dark:text-brand-100' : 'text-stone-400 dark:text-stone-500']}>
	{#if uploading}<LoaderCircle size={17} class="animate-spin motion-reduce:animate-none" aria-hidden="true" />{:else}<ImagePlus size={17} aria-hidden="true" />{/if}
</button>

<div use:portal>
	<Sheet {open} label="Kérdés képe" title="Kérdés képe" onClose={() => (open = false)}>
		<div class="mt-4 space-y-4" aria-busy={uploading}>
			{#if uploadImage}
				<label class="relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 p-4 text-center text-sm font-bold text-ink-900 hover:border-brand-500 hover:bg-brand-50 dark:border-white/20 dark:text-white dark:hover:bg-brand-500/10">
					<input type="file" accept={QUESTION_IMAGE_TYPES.join(',')} onchange={chooseFile} disabled={disabled || uploading} aria-label="Képfájl feltöltése" class="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default" />
					<span class="pointer-events-none absolute inset-0 rounded-2xl peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500"></span>
					{#if uploading}<LoaderCircle size={21} class="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Feltöltés…{:else}<Upload size={21} aria-hidden="true" /> Kép feltöltése{/if}
					<span class="text-xs font-normal text-stone-500 dark:text-stone-400">JPEG, PNG, WebP, GIF vagy AVIF, legfeljebb 10 MB</span>
				</label>
			{/if}
			<div>
				<label for={`${id}-url`} class="{labelClass} mb-1.5 flex items-center gap-1.5"><Link size={15} aria-hidden="true" /> Kép URL-je</label>
				<input id={`${id}-url`} type="url" bind:value={urlValue} disabled={disabled || uploading} placeholder="https://…" maxlength={2048} class={fieldClass}
					oninput={() => (error = '')} onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyUrl(); } }} />
			</div>
			{#if error}<p role="alert" class="text-sm text-red-700 dark:text-red-300">{error}</p>{/if}
			<div class="flex flex-wrap items-center justify-end gap-2">
				{#if value}<Button variant="ghost" disabled={disabled || uploading} onclick={() => { onChange(''); open = false; }}><Trash2 size={16} aria-hidden="true" /> Kép eltávolítása</Button>{/if}
				<Button disabled={disabled || uploading || !urlValue.trim()} onclick={applyUrl}>Kép használata</Button>
			</div>
		</div>
	</Sheet>
</div>
