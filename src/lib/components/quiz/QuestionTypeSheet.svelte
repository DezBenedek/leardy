<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { typeComponents } from '$lib/question-types/components';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import { QUESTION_TYPES, type QuestionTypeId } from '$lib/quiz-editor';

	/* Kérdéstípus választó Sheetben: ikoncsempe, cím, kiválasztva Check. */

	interface Props {
		open: boolean;
		value: string;
		onClose: () => void;
		onPick: (type: QuestionTypeId) => void;
	}

	let { open, value, onClose, onPick }: Props = $props();


	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';
</script>

<div use:portal>
	<Sheet {open} label="Kérdéstípus választása" title="Kérdéstípus" {onClose}>
		<ul class="-mx-1 mt-2 space-y-0.5">
			{#each QUESTION_TYPES as t (t.id)}
				{@const Icon = typeComponents(t.id).icon}
				{@const selected = t.id === value}
				<li>
					<button
						type="button"
						aria-pressed={selected}
						onclick={() => onPick(t.id)}
						class={[rowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
					>
						<span
							class={['grid size-9 shrink-0 place-items-center rounded-xl', selected ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300']}
						>
							<Icon size={18} aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{t.title}</span>
						</span>
						{#if selected}
							<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</Sheet>
</div>
