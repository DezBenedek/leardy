<script lang="ts">
	import { Check, ListChecks, ListOrdered, Pencil, Shapes, Trash2 } from '@lucide/svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import { questionTypeTitle, type CustomTemplate, type QuestionTypeId, type TemplateSeed } from '$lib/quiz-editor';

	interface Props {
		open: boolean;
		custom: CustomTemplate[];
		busy: boolean;
		error: string;
		legacyCount: number;
		onImportLegacy: () => void;
		onRetry: () => void;
		onClose: () => void;
		onPick: (seed: TemplateSeed) => void;
		onDeleteCustom: (key: string) => void;
	}
	let { open, custom, busy, error, legacyCount, onImportLegacy, onRetry, onClose, onPick, onDeleteCustom }: Props = $props();
	const icons: Record<QuestionTypeId, typeof ListChecks> = { choice: ListChecks, tf: Check, text: Pencil, match: Shapes, order: ListOrdered };
</script>

<div use:portal>
	<Sheet {open} label="Saját sablon választása" title="Saját sablonok" {onClose}>
		<p class="mt-2 text-xs text-stone-500 dark:text-stone-400">A fiókodba mentett sablonokat minden eszközödön eléred.</p>
		{#if busy}<p role="status" class="mt-3 text-sm text-stone-500 dark:text-stone-400">Sablonok frissítése…</p>{/if}
		{#if error}
			<p role="alert" class="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>
			<Button size="sm" variant="outline" disabled={busy} onclick={onRetry}>Újrapróbálás</Button>
		{/if}
		{#if !custom.length && !busy && !error}
			<p class="mt-3 text-sm text-stone-500 dark:text-stone-400">Még nincs saját sablonod. Egy kérdés menüjében a Mentés saját sablonként művelettel készíthetsz.</p>
		{:else if custom.length}
			<ul class="-mx-1 mt-2 space-y-0.5" aria-label="Saját sablonok">
				{#each custom as template (template.key)}
					{@const Icon = icons[template.type]}
					<li class="flex items-center gap-1">
						<button type="button" disabled={busy} onclick={() => onPick(template)} class="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-2 text-left hover:bg-stone-100 disabled:opacity-50 dark:hover:bg-white/5">
							<span class="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Icon size={16} aria-hidden="true" /></span>
							<span class="min-w-0 flex-1"><span class="block truncate text-sm font-bold text-ink-900 dark:text-white">{template.title}</span><span class="block text-[11px] text-stone-500 dark:text-stone-400">{questionTypeTitle(template.type)}</span></span>
						</button>
						<button type="button" disabled={busy} aria-label="{template.title} sablon törlése" title="Sablon törlése" onclick={() => onDeleteCustom(template.key)} class="grid size-9 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400"><Trash2 size={16} aria-hidden="true" /></button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if legacyCount && !error}
			<div class="mt-4 space-y-2 border-t border-stone-200 pt-3 dark:border-white/10">
				<p class="text-xs text-stone-500 dark:text-stone-400">Ezen az eszközön {legacyCount} korábbi sablon található. Ha a tieid, átveheted őket a jelenlegi fiókodba.</p>
				<Button size="sm" variant="outline" disabled={busy} onclick={onImportLegacy}>Korábbi sablonok átvétele a fiókba</Button>
			</div>
		{/if}
	</Sheet>
</div>
