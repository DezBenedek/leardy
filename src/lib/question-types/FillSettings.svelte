<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDown, Plus } from '@lucide/svelte';
	import { motionOK } from '$lib/overlay';
	import Collapse from '$lib/ui/Collapse.svelte';
	import type { QuestionEditorProps, InputMode } from './types';
	import { fieldClass, addClass } from './editor-styles';
	import RemoveButton from './RemoveButton.svelte';
	let { draft = $bindable(), saving, onChange, children }: QuestionEditorProps & { children?: Snippet } = $props();
	const id = $props.id();
	const mode = $derived(draft.settings?.mode ?? 'drag');
	let extraOpen = $state(untrack(() => draft.options.length > 0));
	const modes: { id: InputMode; title: string }[] = [{ id: 'drag', title: 'Behúzós' }, { id: 'text', title: 'Beírós' }, { id: 'dropdown', title: 'Lenyílós' }];
</script>

<div class="min-w-0" data-fill-settings>
	<fieldset disabled={saving}>
		<legend class="sr-only">Kitöltés módja</legend>
		<div class="grid grid-cols-3 gap-1.5">
			{#each modes as item (item.id)}
				<button type="button" aria-pressed={mode === item.id} onclick={() => { draft.settings = { ...draft.settings, mode: item.id }; onChange(); }} class={['min-h-11 rounded-xl border px-1 py-2 text-sm font-bold transition-colors motion-reduce:transition-none', mode === item.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'border-stone-300 text-stone-500 dark:border-white/15 dark:text-stone-400']}>{item.title}</button>
			{/each}
		</div>
	</fieldset>
	{#if children}<div class="mt-3">{@render children()}</div>{/if}
	<Collapse open={mode !== 'text'}>
		<div class="pt-3">
			<Collapse open={mode === 'drag'}>
				<label class="mb-2 flex min-h-11 items-center gap-2 rounded-xl bg-stone-50 px-3 text-sm font-bold text-ink-900 dark:bg-white/5 dark:text-white">
					<input type="checkbox" disabled={saving} checked={draft.settings?.reusable ?? false} onchange={(event) => { draft.settings = { ...draft.settings, reusable: event.currentTarget.checked }; onChange(); }} class="size-4 accent-brand-500" />
					Szavak újrahasználata
				</label>
			</Collapse>
			<button type="button" disabled={saving} aria-expanded={extraOpen} aria-controls={`${id}-extras`} onclick={() => (extraOpen = !extraOpen)} class="flex min-h-11 w-full items-center gap-2 rounded-xl border border-stone-200 px-3 text-left text-sm font-bold text-ink-900 dark:border-white/10 dark:text-white">
				<span class="flex-1">További válaszok</span>
				{#if draft.options.length}<span aria-hidden="true" class="text-xs text-stone-400 tabular-nums">{draft.options.length}</span>{/if}
				<ChevronDown size={16} aria-hidden="true" class={['shrink-0 text-stone-400 transition-transform duration-200 motion-reduce:transition-none', extraOpen && 'rotate-180']} />
			</button>
			<Collapse id={`${id}-extras`} open={extraOpen}>
				<div class="space-y-1.5 pt-2">
					{#each draft.options as option, index (index)}
						<div transition:slide={{ duration: motionOK() ? 200 : 0 }}>
							<div class="flex items-center gap-1">
								<label class="sr-only" for={`${id}-extra-${index}`}>{index + 1}. további lehetőség</label>
								<input id={`${id}-extra-${index}`} disabled={saving} class={fieldClass} value={option} oninput={(event) => { draft.options[index] = event.currentTarget.value; onChange(); }} maxlength={200} placeholder="Válaszlehetőség" />
								<RemoveButton disabled={saving} label={`${index + 1}. további lehetőség törlése`} onclick={() => { draft.options = draft.options.filter((_, i) => i !== index); onChange(); }} />
							</div>
						</div>
					{/each}
					{#if draft.options.length < 40}<button type="button" disabled={saving} class={addClass} onclick={() => { draft.options.push(''); onChange(); }}><Plus size={14} aria-hidden="true" /> Válasz hozzáadása</button>{/if}
				</div>
			</Collapse>
		</div>
	</Collapse>
</div>
