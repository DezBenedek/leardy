<script lang="ts">
	import { Plus, RotateCcw, Trash2 } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { motionOK } from '$lib/overlay';
	import Collapse from '$lib/ui/Collapse.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import type { QuestionEditorProps, MapBox } from '../types';
	import FillSettings from '../FillSettings.svelte';
	import Canvas from './Canvas.svelte';
	import { fieldClass, labelClass } from '../editor-styles';
	import Button from '$lib/ui/Button.svelte';
	let { draft = $bindable(), saving, onChange }: QuestionEditorProps = $props();
	const id = $props.id();
	const boxes = $derived(draft.settings?.boxes ?? []);
	let selectedId = $state('');
	const selected = $derived(boxes.find((box) => box.id === selectedId));
	const arrowColors = [{ value: '#000000', label: 'Fekete' }, { value: '#ffffff', label: 'Fehér' }, { value: '#2563eb', label: 'Kék' }, { value: '#ef4444', label: 'Piros' }];
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
		<div>
			<div class="mb-3 flex items-center justify-between gap-2">
				<p class={labelClass}>Válaszmezők <span class="text-xs font-normal text-stone-500">{boxes.length}/20</span></p>
				<Button size="sm" variant="outline" disabled={saving || !draft.imageUrl || boxes.length >= 20} onclick={add}><Plus size={15} aria-hidden="true" /> Mező hozzáadása</Button>
			</div>
			{#if draft.imageUrl}
				<Canvas src={draft.imageUrl} {boxes} editable disabled={saving} selected={selected?.id ?? ''} onSelect={(key) => (selectedId = key)} onMove={(key, point, arrow) => change(key, arrow ? { arrow: point } : point)}>
					{#snippet field(index)}<span class="truncate">{index + 1}. {boxes[index].answer || 'Válasz'}</span>{/snippet}
				</Canvas>
			{:else}<p class="rounded-xl border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">Tölts fel egy képet a képikonnal.</p>{/if}
			{#if boxes.length && !selected}<div transition:slide={{ duration: motionOK() ? 280 : 0, easing: cubicOut }}><p class="pt-3 text-xs text-stone-500 dark:text-stone-400">Kattints a képen egy mezőre a beállításaihoz.</p></div>{/if}
			{#if selected}
				<div data-map-field-settings class="pt-3" transition:slide={{ duration: motionOK() ? 280 : 0, easing: cubicOut }}>
					<fieldset disabled={saving} class="rounded-xl border border-stone-200 p-2.5 dark:border-white/10">
						<legend class="sr-only">{boxes.indexOf(selected) + 1}. mező</legend>
						<div class="flex items-end gap-2">
							<div class="min-w-0 flex-1"><label for={`${id}-answer`} class="mb-1 block text-xs font-bold text-ink-900 dark:text-white">Helyes válasz</label><input id={`${id}-answer`} class="{fieldClass} h-9 py-1 text-sm" value={selected.answer} oninput={(event) => change(selected.id, { answer: event.currentTarget.value })} maxlength={200} placeholder="Válasz" /></div>
							<button type="button" aria-label="Mező törlése" title="Mező törlése" onclick={() => remove(selected.id)} class="grid size-9 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={17} aria-hidden="true" /></button>
						</div>
						<div class="mt-2 flex items-center gap-3">
							<div class="min-w-0 flex-1"><label for={`${id}-width`} class="mb-0.5 flex items-center justify-between text-xs font-bold text-stone-500 dark:text-stone-400">Szélesség<span class="tabular-nums">{selected.width}%</span></label><input id={`${id}-width`} type="range" min="10" max="60" step="1" value={selected.width} oninput={(event) => { const width = +event.currentTarget.value; change(selected.id, { width, x: Math.max(width / 2, Math.min(100 - width / 2, selected.x)) }); }} class="block h-5 w-full accent-brand-500" /></div>
							<div class="flex items-center gap-2 text-xs font-bold text-ink-900 dark:text-white"><span>Nyíl</span><Toggle label="Nyíl bekapcsolása" disabled={saving} bind:checked={() => !!selected.arrow, (enabled) => change(selected.id, { arrow: enabled ? { x: selected.x, y: Math.min(95, selected.y + 20) } : undefined })} /></div>
						</div>
						<Collapse id={`${id}-arrow-options`} open={!!selected.arrow}>
							<div class="pt-2">
								<div class="flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-2 dark:border-white/10">
									<span class="mr-auto text-xs font-bold text-stone-500 dark:text-stone-400">Nyílszín</span>
									{#each arrowColors as color (color.value)}
										<button type="button" aria-label={`${color.label} nyíl`} aria-pressed={selected.arrowColor === color.value} onclick={() => change(selected.id, { arrowColor: color.value })} style:background-color={color.value} class={['size-6 shrink-0 rounded-full border border-stone-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:border-white/30', selected.arrowColor === color.value && 'ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-stone-900']}></button>
									{/each}
									<input type="color" aria-label="Egyéni nyílszín" value={selected.arrowColor ?? '#000000'} oninput={(event) => change(selected.id, { arrowColor: event.currentTarget.value })} class="size-7 cursor-pointer rounded border border-stone-300 bg-transparent p-0.5 dark:border-white/20" />
									<button type="button" disabled={saving || !selected.arrowColor} aria-label="Automatikus nyílszín visszaállítása" title="Automatikus nyílszín" onclick={() => change(selected.id, { arrowColor: undefined })} class="grid size-7 shrink-0 place-items-center rounded text-stone-500 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-white/10"><RotateCcw size={14} aria-hidden="true" /></button>
								</div>
							</div>
						</Collapse>
					</fieldset>
				</div>
			{/if}
		</div>
	</FillSettings>
</div>
