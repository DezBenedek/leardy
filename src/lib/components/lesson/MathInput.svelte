<script lang="ts">
	import { onMount } from 'svelte';
	import type { MathfieldElement } from 'mathlive';
	import { validLessonMath, renderLessonMath } from '$lib/lesson-render';
	import { resolve } from '$app/paths';
	import Button from '$lib/ui/Button.svelte';
	let { initial = '', block = false, onApply, onRemove }: {
		initial?: string; block?: boolean; onApply: (latex: string, block: boolean) => void; onRemove?: () => void;
	} = $props();
	let host: HTMLDivElement;
	let keyboard: HTMLDivElement;
	let field: MathfieldElement | undefined;
	let latex = $state('');
	let display = $state(false);
	let ready = $state(false);
	let error = $state('');
	const templates = [
		{ label: 'Tört', value: '\\frac{#0}{#?}' }, { label: 'Hatvány', value: '#@^{#?}' },
		{ label: 'Gyök', value: '\\sqrt{#0}' }, { label: 'Alsó index', value: '#@_{#?}' },
		{ label: 'Zárójel', value: '\\left(#0\\right)' }, { label: 'Összeg', value: '\\sum_{#0}^{#?}' },
		{ label: 'Integrál', value: '\\int_{#0}^{#?}' }, { label: 'Pi', value: '\\pi' }
	];
	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | undefined;
		display = block;
		void import('mathlive').then(({ MathfieldElement }) => {
			if (disposed) return;
			MathfieldElement.fontsDirectory = resolve('/fonts/mathlive' as '/');
			MathfieldElement.soundsDirectory = null;
			const mf = new MathfieldElement();
			field = mf;
			mf.setAttribute('aria-label', 'Matematikai képlet');
			mf.mathVirtualKeyboardPolicy = 'manual';
			mf.value = initial;
			latex = initial;
			// Az üres gazdaelem tartalmát kizárólag a MathLive kezeli, eltávolítását a cleanup végzi.
			host.appendChild(mf);
			mf.menuItems = [];
			const vk = window.mathVirtualKeyboard;
			const oldContainer = vk.container;
			vk.container = keyboard;
			vk.layouts = ['numeric', 'symbols', 'greek'];
			mf.focus();
			vk.show();
			const update = () => { latex = mf.value; error = ''; };
			mf.addEventListener('input', update);
			ready = true;
			cleanup = () => { mf.removeEventListener('input', update); vk.hide(); vk.container = oldContainer; mf.remove(); };
		}).catch(() => { error = 'A képletszerkesztő nem töltődött be. Zárd be, majd próbáld újra.'; });
		return () => { disposed = true; cleanup?.(); };
	});
	function apply() {
		if (!validLessonMath(latex)) { error = 'Fejezd be a képletet, és töltsd ki az üres helyeket. A nem támogatott LaTeX-parancsot javítsd.'; return; }
		onApply(latex, display);
	}
</script>

<div class="math-input mt-4 space-y-3">
	<p class="text-sm text-stone-500 dark:text-stone-400">Írj képletet, illessz be LaTeX-et, vagy használd a matematikai gombokat.</p>
	<div class="flex flex-wrap gap-1.5">
		{#each templates as item (item.label)}
			<button type="button" class="math-template" disabled={!ready} onclick={() => { field?.executeCommand(['insert', item.value]); field?.focus(); latex = field?.value ?? ''; }}>{item.label}</button>
		{/each}
	</div>
	<div bind:this={host} class="math-field-host"></div>
	<div bind:this={keyboard} class="math-keyboard"></div>
	<label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" bind:checked={display} /> Külön sorban jelenjen meg</label>
	{#if latex && validLessonMath(latex)}<div class="lesson-prose overflow-x-auto rounded-xl bg-stone-50 p-3 dark:bg-white/5">{@html renderLessonMath(latex, display)}</div>{/if}
	{#if error}<p role="alert" class="text-sm text-red-600 dark:text-red-300">{error}</p>{/if}
	<div class="flex justify-end gap-2">
		{#if onRemove}<Button variant="ghost" onclick={onRemove}>Képlet eltávolítása</Button>{/if}
		<Button disabled={!ready || !latex.trim()} onclick={apply}>Képlet használata</Button>
	</div>
</div>

<style>
	.math-template { border: 1px solid var(--color-stone-200); border-radius: 8px; padding: 6px 9px; font-size: 12px; font-weight: 600; }
	.math-template:hover { background: var(--color-stone-100); }
	:global(.dark) .math-template { border-color: rgb(255 255 255 / .15); }
	:global(.dark) .math-template:hover { background: rgb(255 255 255 / .08); }
	.math-field-host :global(math-field) { width: 100%; min-height: 56px; padding: 10px; border: 1px solid var(--color-stone-300); border-radius: 12px; font-size: 22px; background: white; color: #292524; }
	.math-keyboard { position: relative; height: 230px; width: 100%; overflow: hidden; border-radius: 12px; --keyboard-zindex: 1; --keycap-height: 42px; --keycap-font-size: 18px; --keyboard-accent-color: var(--color-brand-600); }
	:global(.dark) .math-keyboard { --keyboard-background: #292524; --keyboard-border: #57534e; --keyboard-toolbar-text: #d6d3d1; --keyboard-toolbar-background-hover: #44403c; --keycap-background: #44403c; --keycap-background-hover: #57534e; --keycap-text: #fafaf9; --keycap-border: #57534e; --keycap-border-bottom: #1c1917; --keycap-secondary-background: #57534e; --keycap-secondary-text: #fafaf9; }
	:global(.dark) .math-field-host :global(math-field) { background: #292524; color: white; --caret-color: #a5b4fc; --selection-background-color: #6366f144; }
</style>
