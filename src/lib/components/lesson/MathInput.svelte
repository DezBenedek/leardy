<script lang="ts">
	import { onMount } from 'svelte';
	import type { MathfieldElement, Selector } from 'mathlive';
	import { validLessonMath, renderLessonMath } from '$lib/lesson-render';
	import { resolve } from '$app/paths';
	import { ArrowLeft, ArrowRight, Delete, Redo2, Undo2, CornerDownRight, Trash2 } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	let { initial = '', block = false, onApply, onRemove }: {
		initial?: string; block?: boolean; onApply: (latex: string, block: boolean) => void; onRemove?: () => void;
	} = $props();
	let host: HTMLDivElement;
	let field: MathfieldElement | undefined;
	let latex = $state('');
	let display = $state(false);
	let ready = $state(false);
	let error = $state('');
	let tab = $state<'basic' | 'symbols' | 'greek'>('basic');
	const templates = [
		{ label: 'Tört', preview: '\\frac{a}{b}', value: '\\frac{#0}{#?}' },
		{ label: 'Hatvány', preview: 'x^n', value: '#@^{#?}' },
		{ label: 'Gyök', preview: '\\sqrt{x}', value: '\\sqrt{#0}' },
		{ label: 'Alsó index', preview: 'x_n', value: '#@_{#?}' },
		{ label: 'Zárójel', preview: '(x)', value: '\\left(#0\\right)' },
		{ label: 'Összeg', preview: '\\sum', value: '\\sum_{#0}^{#?}' },
		{ label: 'Integrál', preview: '\\int', value: '\\int_{#0}^{#?}' },
		{ label: 'Pi', preview: '\\pi', value: '\\pi' }
	];
	const keys = {
		basic: ['7', '8', '9', '+', '-', 'x', '4', '5', '6', '\\times', '\\div', 'y', '1', '2', '3', '=', '(', ')', '0', '.', ',', '<', '>', 'n'],
		symbols: ['\\le', '\\ge', '\\ne', '\\approx', '\\pm', '\\infty', '\\in', '\\notin', '\\subset', '\\cup', '\\cap', '\\emptyset', '\\rightarrow', '\\Rightarrow', '\\Leftrightarrow', '\\forall', '\\exists', '\\partial', '\\sin', '\\cos', '\\tan', '\\log', '\\ln', '\\lim'],
		greek: ['\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\zeta', '\\eta', '\\theta', '\\lambda', '\\mu', '\\nu', '\\xi', '\\pi', '\\rho', '\\sigma', '\\tau', '\\phi', '\\omega', '\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Sigma', '\\Omega']
	};
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
			// A MathLive az üres gazdaelemben csak a képlet bevitelét kezeli. A kezelőfelület saját.
			host.appendChild(mf);
			mf.menuItems = [];
			const preventKeyboard = (event: Event) => { event.preventDefault(); };
			mf.addEventListener('before-virtual-keyboard-toggle', preventKeyboard);
			const update = () => { latex = mf.value; error = ''; };
			mf.addEventListener('input', update);
			ready = true;
			cleanup = () => { mf.removeEventListener('input', update); mf.removeEventListener('before-virtual-keyboard-toggle', preventKeyboard); mf.remove(); };
		}).catch(() => { error = 'A képletszerkesztő nem töltődött be. Zárd be, majd próbáld újra.'; });
		return () => { disposed = true; cleanup?.(); };
	});
	function command(value: Selector | [Selector, ...unknown[]]) {
		if (!field) return;
		field.focus();
		if (Array.isArray(value)) field.executeCommand(value);
		else field.executeCommand(value);
		latex = field.value; error = '';
	}
	function insert(value: string) { command(['insert', value]); }
	function apply() {
		if (!validLessonMath(latex)) { error = 'Fejezd be a képletet, és töltsd ki az üres helyeket. A nem támogatott LaTeX-parancsot javítsd.'; return; }
		onApply(latex, display);
	}
</script>

<div class="math-input">
	<div class="math-field-host" bind:this={host}></div>
	<div class="math-controls" role="toolbar" aria-label="Képlet szerkesztése">
		{#each [
			{ label: 'Balra', icon: ArrowLeft, command: 'moveToPreviousChar' },
			{ label: 'Jobbra', icon: ArrowRight, command: 'moveToNextChar' },
			{ label: 'Következő üres hely', icon: CornerDownRight, command: 'moveToNextPlaceholder' },
			{ label: 'Képletművelet visszavonása', icon: Undo2, command: 'undo' },
			{ label: 'Képletművelet újraalkalmazása', icon: Redo2, command: 'redo' },
			{ label: 'Előző jel törlése', icon: Delete, command: 'deleteBackward' }
		] as tool (tool.label)}
			<button type="button" aria-label={tool.label} title={tool.label} disabled={!ready} onpointerdown={(event) => event.preventDefault()} onclick={() => command(tool.command as Selector)}><tool.icon size={17} /></button>
		{/each}
	</div>
	<div class="math-templates" role="toolbar" aria-label="Képletsablonok">
		{#each templates as item (item.label)}
			<button type="button" class="math-template" aria-label={item.label} title={item.label} disabled={!ready} onpointerdown={(event) => event.preventDefault()} onclick={() => insert(item.value)}>{@html renderLessonMath(item.preview, false)}</button>
		{/each}
	</div>
	<div class="math-keypad">
		<div class="keypad-tabs" role="tablist" aria-label="Matematikai jelek">
			{#each [{ id: 'basic', label: '123' }, { id: 'symbols', label: 'Jelek' }, { id: 'greek', label: 'Görög' }] as item (item.id)}
				<button type="button" role="tab" aria-selected={tab === item.id} onpointerdown={(event) => event.preventDefault()} onclick={() => { tab = item.id as typeof tab; }}>{item.label}</button>
			{/each}
		</div>
		<div class="math-keys" aria-label="Képletbillentyűk">
			{#each keys[tab] as value (value)}
				<button type="button" class="math-key" aria-label={`Beszúrás: ${value.replaceAll('\\', '')}`} disabled={!ready} onpointerdown={(event) => event.preventDefault()} onclick={() => insert(value)}>{@html renderLessonMath(value, false)}</button>
			{/each}
		</div>
	</div>
	<div class="math-options">
		<label><input type="checkbox" bind:checked={display} /> Külön sorban jelenjen meg</label>
		<details><summary>LaTeX</summary><textarea aria-label="LaTeX-forrás" rows={2} value={latex} oninput={(event) => { latex = event.currentTarget.value; if (field) field.value = latex; error = ''; }} spellcheck="false"></textarea></details>
	</div>
	{#if error}<p role="alert" class="text-xs text-red-600 dark:text-red-300">{error}</p>{/if}
	<div class="math-footer">
		{#if onRemove}<button type="button" class="math-remove" aria-label="Képlet eltávolítása" title="Képlet eltávolítása" onclick={onRemove}><Trash2 size={18} /></button>{/if}
		<Button disabled={!ready || !latex.trim()} onclick={apply}>Képlet használata</Button>
	</div>
</div>

<style>
	.math-input { display: grid; gap: 12px; margin-top: 16px; min-width: 0; }
	.math-field-host { min-width: 0; }
	.math-field-host :global(math-field) { display: block; width: 100%; min-height: 72px; max-width: 100%; padding: 12px; border: 1px solid var(--color-stone-200); border-radius: 12px; font-size: 24px; background: var(--color-stone-50); color: var(--color-ink-900); --caret-color: var(--color-brand-600); --selection-background-color: #6366f133; }
	.math-field-host :global(math-field:focus-within) { border-color: var(--color-brand-400); outline: 2px solid rgb(99 102 241 / .1); }
	.math-field-host :global(math-field::part(menu-toggle)), .math-field-host :global(math-field::part(virtual-keyboard-toggle)) { display: none; }
	.math-controls { display: flex; justify-content: flex-end; gap: 2px; margin-top: -8px; }
	.math-controls button, .math-remove { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: var(--color-stone-500); }
	.math-controls button:hover { background: rgb(120 113 108 / .08); }
	.math-templates { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 4px; }
	.math-template { display: grid; place-items: center; min-height: 42px; border: 1px solid var(--color-stone-200); border-radius: 8px; }
	.math-template :global(.katex) { font-size: 1em; }
	.math-template:hover, .math-key:hover { border-color: var(--color-brand-300); background: var(--color-brand-50); color: var(--color-brand-600); }
	.math-keypad { padding: 6px; border-radius: 12px; background: var(--color-stone-100); }
	.keypad-tabs { display: flex; gap: 3px; margin-bottom: 6px; }
	.keypad-tabs button { border-radius: 7px; padding: 6px 12px; font-size: 11px; font-weight: 800; color: var(--color-stone-500); }
	.keypad-tabs button[aria-selected='true'] { background: white; color: var(--color-brand-600); box-shadow: 0 1px 3px rgb(0 0 0 / .06); }
	.math-keys { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
	.math-key { display: grid; place-items: center; min-height: 36px; border: 1px solid transparent; border-radius: 7px; background: white; font-size: 14px; }
	.math-key :global(.katex) { font-size: 1.05em; }
	.math-options { display: grid; gap: 8px; font-size: 12px; color: var(--color-stone-500); }
	.math-options label { display: flex; align-items: center; gap: 7px; }
	.math-options summary { width: max-content; cursor: pointer; font-size: 11px; }
	.math-options textarea { display: block; width: 100%; margin-top: 6px; border: 1px solid var(--color-stone-200); border-radius: 8px; padding: 8px; font-family: monospace; color: var(--color-ink-900); }
	.math-footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
	.math-remove:hover { background: var(--color-red-50); color: var(--color-red-600); }
	.math-input button:disabled { opacity: .4; }
	.math-input button:focus-visible { outline: 2px solid var(--color-brand-500); outline-offset: 2px; }
	:global(.dark) .math-field-host :global(math-field) { background: rgb(255 255 255 / .03); border-color: rgb(255 255 255 / .15); color: white; --caret-color: #a5b4fc; }
	:global(.dark) .math-template, :global(.dark) .math-options textarea { border-color: rgb(255 255 255 / .15); }
	:global(.dark) .math-keypad { background: rgb(255 255 255 / .04); }
	:global(.dark) .math-controls button, :global(.dark) .math-options, :global(.dark) .keypad-tabs button { color: var(--color-stone-400); }
	:global(.dark) .math-key, :global(.dark) .keypad-tabs button[aria-selected='true'] { background: rgb(255 255 255 / .07); color: var(--color-stone-200); }
	:global(.dark) .math-template:hover, :global(.dark) .math-key:hover { background: rgb(99 102 241 / .15); color: var(--color-brand-300); }
	:global(.dark) .math-options textarea { background: rgb(255 255 255 / .03); color: white; }
	@media (max-width: 420px) { .math-templates { gap: 3px; } .math-template { min-height: 38px; } .math-template :global(.katex) { font-size: .85em; } }
</style>
