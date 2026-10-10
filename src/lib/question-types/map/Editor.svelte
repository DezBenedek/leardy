<script lang="ts">
	import { ChevronDown, Plus, Trash2 } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import { motionOK } from '$lib/overlay';
	import Collapse from '$lib/ui/Collapse.svelte';
	import type { QuestionEditorProps, MapBox } from '../types';
	import FillSettings from '../FillSettings.svelte';
	import Canvas from './Canvas.svelte';
	import { fieldClass, labelClass } from '../editor-styles';
	import Button from '$lib/ui/Button.svelte';
	let { draft = $bindable(), saving, onChange }: QuestionEditorProps = $props();
	const id = $props.id();
	const boxes = $derived(draft.settings?.boxes ?? []);
	let selectedId = $state('');
	let detailsOpen = $state(false);
	const selected = $derived(boxes.find((box) => box.id === selectedId) ?? boxes[0]);
	function add() {
		if (saving || boxes.length >= 20) return;
		const box: MapBox = { id: crypto.randomUUID(), x: 50, y: 25 + boxes.length % 4 * 15, width: 28, answer: '' };
		draft.settings = { ...draft.settings, boxes: [...boxes, box] };
		selectedId = box.id;
		onChange();
	}
	function change(key: string, values: Partial<MapBox>) {
		draft.settings = { ...draft.settings, boxes: boxes.map((box) => box.id === key ? { ...box, ...values } : box) };
		onChange();
	}
	function remove(key: string) {
		draft.settings = { ...draft.settings, boxes: boxes.filter((box) => box.id !== key) };
		selectedId = '';
		onChange();
	}
</script>

<div data-map-editor class="[overflow-anchor:none]">
	<FillSettings bind:draft {saving} {onChange}>
		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<p class={labelClass}>Válaszmezők <span class="text-xs font-normal text-stone-500">{boxes.length}/20</span></p>
				<Button size="sm" variant="outline" disabled={saving || !draft.imageUrl || boxes.length >= 20} onclick={add}><Plus size={15} aria-hidden="true" /> Mező hozzáadása</Button>
			</div>
			{#if draft.imageUrl}
				<Canvas src={draft.imageUrl} {boxes} editable disabled={saving} selected={selected?.id ?? ''} onSelect={(key) => (selectedId = key)} onMove={(key, point, arrow) => change(key, arrow ? { arrow: point } : point)}>
					{#snippet field(index)}<span class="truncate">{index + 1}. {boxes[index].answer || 'Válasz'}</span>{/snippet}
				</Canvas>
			{:else}<p class="rounded-xl border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">Tölts fel egy képet a képikonnal.</p>{/if}
			{#if boxes.length}
				<div transition:slide={{ duration: motionOK() ? 220 : 0 }}>
					<div class="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Szerkesztendő mező">
						{#each boxes as box, index (box.id)}<button type="button" disabled={saving} aria-pressed={selected?.id === box.id} onclick={() => (selectedId = box.id)} class={['min-h-9 shrink-0 rounded-lg border px-3 text-xs font-bold', selected?.id === box.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'border-stone-300 text-stone-500 dark:border-white/15 dark:text-stone-400']}>{index + 1}. mező</button>{/each}
					</div>
				</div>
			{/if}
			{#if selected}
				<div transition:slide={{ duration: motionOK() ? 220 : 0 }}>
					<fieldset disabled={saving} class="rounded-xl border border-stone-200 p-3 dark:border-white/10">
						<legend class="sr-only">{boxes.indexOf(selected) + 1}. mező</legend>
						<div class="flex items-end gap-2">
							<div class="min-w-0 flex-1"><label for={`${id}-answer`} class="{labelClass} mb-1">Helyes válasz</label><input id={`${id}-answer`} class={fieldClass} value={selected.answer} oninput={(event) => change(selected.id, { answer: event.currentTarget.value })} maxlength={200} placeholder="Válasz" /></div>
							<button type="button" aria-label="Mező törlése" title="Mező törlése" onclick={() => remove(selected.id)} class="grid size-11 shrink-0 place-items-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={17} aria-hidden="true" /></button>
						</div>
						<button type="button" aria-expanded={detailsOpen} aria-controls={`${id}-details`} onclick={() => (detailsOpen = !detailsOpen)} class="mt-2 flex min-h-9 w-full items-center justify-between text-left text-xs font-bold text-stone-500 dark:text-stone-400">Mező beállításai<ChevronDown size={15} aria-hidden="true" class={['transition-transform duration-200 motion-reduce:transition-none', detailsOpen && 'rotate-180']} /></button>
						<Collapse id={`${id}-details`} open={detailsOpen}>
							<div class="space-y-2 pt-2">
								<div><label for={`${id}-width`} class="mb-1 flex items-center justify-between text-xs font-bold text-stone-500 dark:text-stone-400">Szélesség<span class="tabular-nums">{selected.width}%</span></label><input id={`${id}-width`} type="range" min="10" max="60" step="1" value={selected.width} oninput={(event) => { const width = +event.currentTarget.value; change(selected.id, { width, x: Math.max(width / 2, Math.min(100 - width / 2, selected.x)) }); }} class="w-full accent-brand-500" /></div>
								<label class="flex min-h-10 items-center gap-2 text-sm font-bold text-ink-900 dark:text-white"><input type="checkbox" checked={!!selected.arrow} onchange={(event) => change(selected.id, { arrow: event.currentTarget.checked ? { x: selected.x, y: Math.min(95, selected.y + 20) } : undefined })} class="size-4 accent-brand-500" /> Nyíl bekapcsolása</label>
							</div>
						</Collapse>
					</fieldset>
				</div>
			{/if}
		</div>
	</FillSettings>
</div>
