<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Editor } from '@tiptap/core';
	import type { Selection } from '@tiptap/pm/state';
	import { CellSelection } from '@tiptap/pm/tables';
	import { Bold, Italic, List, ListOrdered, Link, Plus, Undo2, Redo2, Type, Highlighter, Underline, Strikethrough, Subscript, Superscript, Image, Sigma, Table, Info, Lightbulb, BookOpen, ChevronDown, Code, Quote, Minus, Eraser, Ungroup, Trash2, ArrowDown, ArrowRight, ArrowUp, ArrowLeft, Check } from '@lucide/svelte';
	import ActionMenu from '$lib/ui/ActionMenu.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import { normalizeQuestionImageUrl, MAX_QUESTION_IMAGE_BYTES, QUESTION_IMAGE_TYPES } from '$lib/question-image';
	import { safeLessonLink, type LessonNode } from '$lib/lesson-content';
	import { lessonEditorExtensions } from './lesson-editor-extensions';
	import MathInput from './MathInput.svelte';
	import EditorPopover from './EditorPopover.svelte';
	import './lesson-content.css';
	import 'katex/dist/katex.min.css';

	let { initialDoc, lessonId, disabled = false, expanded = false, onActivate, onChange, onBusyChange }: {
		initialDoc: LessonNode; lessonId: string; disabled?: boolean; expanded?: boolean; onActivate: (anchor: HTMLElement) => void;
		onChange: (doc: LessonNode) => void; onBusyChange: (busy: boolean) => void;
	} = $props();
	const initial = untrack(() => initialDoc);
	const id = $props.id();
	let element: HTMLDivElement;
	let editor: Editor | undefined;
	export function focusContent() {
		editor?.commands.focus('end', { scrollIntoView: false });
	}
	let pointerSelecting = false;
	function activateDocument() {
		if (!expanded && editor) {
			// A böngésző kijelölése megelőzheti a ProseMirror késleltetett frissítését.
			const selection = window.getSelection();
			if (selection?.anchorNode && selection.focusNode && element.contains(selection.anchorNode) && element.contains(selection.focusNode)) {
				editor.commands.setTextSelection({
					from: editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset),
					to: editor.view.posAtDOM(selection.focusNode, selection.focusOffset)
				});
			}
		}
		onActivate(element);
	}
	let snapshot = $state.raw<{ editor: Editor } | null>(null);
	let modal = $state<'image' | 'math' | 'link' | 'solution' | null>(null);
	let modalKind = $state<NonNullable<typeof modal>>('image');
	let editPos = $state<number | null>(null);
	let selection = $state({ from: 0, to: 0 });
	let error = $state('');
	let uploading = $state(false);
	let src = $state('');
	let alt = $state('');
	let caption = $state('');
	let width = $state<'full' | 'half'>('full');
	let latex = $state('');
	let mathBlock = $state(false);
	let href = $state('');
	let linkText = $state('');
	let solutionTitle = $state('Megoldás');
	let tablePopover = $state<'edit' | null>(null);
	let tableInsertOpen = $state(false);
	let tableTrigger: HTMLButtonElement | undefined = $state();
	let toolbarNode: HTMLDivElement;
	let tableSelection: Selection | null = null;
	let tableKeyboard = $state(false);
	let tableHeader = $state(false);
	let tablePosition = $state('');
	let documentHeight = $state(48);
	let rows = $state(3);
	let cols = $state(3);
	const fieldClass = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5';

	onMount(() => {
		editor = new Editor({
			element, content: initial, editable: !disabled,
			extensions: lessonEditorExtensions(
				(pos, value, block) => { open('math', pos); latex = value; mathBlock = block; },
				(pos) => { open('image', pos); const a = editor!.state.doc.nodeAt(pos)!.attrs; src = a.src; alt = a.alt; caption = a.caption; width = a.width; },
				(pos, title) => { open('solution', pos); solutionTitle = title; },
				() => expanded && controlsHaveFocus()
			),
			editorProps: { attributes: { class: 'lesson-prose lesson-editable', role: 'textbox', 'aria-label': 'Bekezdés tartalma', 'aria-multiline': 'true', spellcheck: 'true' } },
			onTransaction: ({ editor: e }) => { snapshot = { editor: e }; },
			onUpdate: ({ editor: e }) => { tablePopover = null; onChange(e.getJSON() as LessonNode); }
		});
		snapshot = { editor };
		documentHeight = element.getBoundingClientRect().height;
		return () => { editor?.destroy(); };
	});
	$effect(() => { const editable = !disabled; untrack(() => editor?.setEditable(editable, false)); });
	function measureDocument(node: HTMLDivElement) {
		const observer = new ResizeObserver(() => { documentHeight = node.getBoundingClientRect().height; });
		observer.observe(node);
		return () => observer.disconnect();
	}
	function animateExpansion(node: HTMLDivElement) {
		let previous = expanded;
		let timer: ReturnType<typeof setTimeout>;
		$effect.pre(() => {
			const next = expanded;
			if (next === previous) return;
			previous = next;
			clearTimeout(timer);
			node.dataset.resizing = 'true';
			// Gépeléskor a mező azonnal nőjön; csak a bekezdésváltás legyen animált.
			timer = setTimeout(() => { delete node.dataset.resizing; }, 280);
		});
		return () => clearTimeout(timer);
	}
	function controlsHaveFocus() {
		const focused = document.activeElement;
		if (!(focused instanceof HTMLElement) || !toolbarNode) return false;
		if (toolbarNode.contains(focused)) return true;
		const panel = focused.closest('.dropdown, [role="dialog"]');
		return !!panel?.id && !!toolbarNode.querySelector(`[aria-controls="${CSS.escape(panel.id)}"]`);
	}
	function keepToolbarFocus(event: PointerEvent) {
		if (event.button === 0 && event.target instanceof Element && event.target.closest('button')) event.preventDefault();
	}
	function selectedCell() {
		if (!editor) return null;
		const selected = editor.state.selection;
		if (selected instanceof CellSelection) return editor.view.nodeDOM(selected.$anchorCell.pos) as HTMLTableCellElement | null;
		for (let depth = selected.$from.depth; depth > 0; depth--) {
			const name = selected.$from.node(depth).type.name;
			if (name === 'tableCell' || name === 'tableHeader') return editor.view.nodeDOM(selected.$from.before(depth)) as HTMLTableCellElement | null;
		}
		const dom = editor.view.nodeDOM(selected.from);
		return dom instanceof Element ? dom.querySelector<HTMLTableCellElement>('td, th') : null;
	}
	function tableMenuAnchor() {
		return tableTrigger?.getBoundingClientRect() ?? null;
	}
	function openTable(edit = false, keyboard = !editor?.view.hasFocus()) {
		if (!editor || disabled || uploading) return;
		selection = { from: editor.state.selection.from, to: editor.state.selection.to };
		tableSelection = editor.state.selection;
		const cell = selectedCell();
		tableKeyboard = keyboard;
		const firstRow = cell?.closest('table')?.rows[0];
		tableHeader = !!firstRow?.cells.length && [...firstRow.cells].every((item) => item.tagName === 'TH');
		tablePosition = cell ? `${(cell.parentElement as HTMLTableRowElement).rowIndex + 1}. sor · ${cell.cellIndex + 1}. oszlop` : '';
		tablePopover = 'edit';
	}
	function openTableInsert() {
		if (!editor || disabled || uploading) return;
		selection = { from: editor.state.selection.from, to: editor.state.selection.to };
		tableInsertOpen = true;
	}
	function closeTable() { tablePopover = null; editor?.commands.focus(undefined, { scrollIntoView: false }); }
	function closeTableInsert(restoreFocus = true) {
		tableInsertOpen = false;
		if (restoreFocus) editor?.commands.focus(undefined, { scrollIntoView: false });
	}
	function clampTableSize(value: number) {
		if (!Number.isFinite(value)) return 1;
		return Math.max(1, Math.min(12, Math.trunc(value)));
	}
	function runTable(action: (e: Editor) => void) {
		run((e) => {
			if (tableSelection?.$from.doc === e.state.doc) e.view.dispatch(e.state.tr.setSelection(tableSelection));
			action(e);
		});
		closeTable();
	}
	function applyTable(event: SubmitEvent) {
		event.preventDefault();
		if (!editor || !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 12 || cols > 12) return;
		editor.chain().focus().setTextSelection(selection).insertTable({ rows, cols, withHeaderRow: true }).run();
		tableInsertOpen = false;
	}
	function active(name: string) { return snapshot?.editor.isActive(name) ?? false; }
	function run(action: (e: Editor) => void) { if (editor && !disabled && !uploading) action(editor); }
	function open(kind: typeof modal, pos: number | null = null) {
		if (!editor || disabled || uploading || !kind) return;
		selection = { from: editor.state.selection.from, to: editor.state.selection.to };
		editPos = pos; error = ''; modalKind = kind; modal = kind;
		if (kind === 'image' && pos === null) { src = ''; alt = ''; caption = ''; width = 'full'; }
		if (kind === 'math' && pos === null) { latex = ''; mathBlock = false; }
		if (kind === 'link') { href = editor.getAttributes('link').href ?? ''; linkText = editor.state.doc.textBetween(selection.from, selection.to); }
		if (kind === 'solution' && pos === null) solutionTitle = 'Megoldás';
	}
	function close() { if (uploading) return; modal = null; editor?.commands.focus(); }
	function insert(node: LessonNode) {
		if (!editor) return;
		const range = editPos === null ? selection : { from: editPos, to: editPos + (editor.state.doc.nodeAt(editPos)?.nodeSize ?? 0) };
		editor.chain().focus().insertContentAt(range, node).run();
		close();
	}
	function removeNode() {
		if (editor && editPos !== null) editor.chain().focus().deleteRange({ from: editPos, to: editPos + (editor.state.doc.nodeAt(editPos)?.nodeSize ?? 0) }).run();
		close();
	}
	function applyImage() {
		const url = normalizeQuestionImageUrl(src);
		if (!url) { error = 'Adj meg érvényes kép-URL-t vagy tölts fel egy képet.'; return; }
		insert({ type: 'figure', attrs: { src: url, alt, caption, width } });
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0]; input.value = '';
		if (!file || uploading || disabled) return;
		if (!file.size || file.size > MAX_QUESTION_IMAGE_BYTES) { error = 'Nem üres, legfeljebb 10 MB-os képet válassz.'; return; }
		if (file.type && !QUESTION_IMAGE_TYPES.includes(file.type)) { error = 'JPEG, PNG, WebP, GIF vagy AVIF képet válassz.'; return; }
		uploading = true; onBusyChange(true); error = '';
		try {
			const form = new FormData(); form.set('lessonId', lessonId); form.set('file', file);
			const response = await fetch('/api/lesson-images', { method: 'POST', body: form });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error ?? 'A kép feltöltése nem sikerült.');
			const url = normalizeQuestionImageUrl(data.imageUrl);
			if (!url) throw new Error('Érvénytelen képhivatkozás érkezett.');
			src = url;
		} catch (problem) { error = problem instanceof Error ? problem.message : 'A feltöltés nem sikerült. Próbáld újra.'; }
		finally { uploading = false; onBusyChange(false); }
	}
	function applyLink() {
		const url = safeLessonLink(href);
		if (!url || !editor) { error = 'Érvényes webcímet vagy e-mail-hivatkozást adj meg.'; return; }
		const chain = editor.chain().focus().setTextSelection(selection);
		if (selection.from !== selection.to || active('link')) chain.extendMarkRange('link').setLink({ href: url }).run();
		else chain.insertContent({ type: 'text', text: linkText.trim() || url, marks: [{ type: 'link', attrs: { href: url } }] }).run();
		close();
	}
	function callout(kind: string) { run((e) => e.isActive('callout') ? e.chain().focus().updateAttributes('callout', { kind }).run() : e.chain().focus().wrapIn('callout', { kind }).run()); }
	function applySolution() {
		if (!editor || !solutionTitle.trim()) { error = 'Adj címet a lenyitható tartalomnak.'; return; }
		if (editPos !== null) editor.chain().focus().setNodeSelection(editPos).updateAttributes('solution', { title: solutionTitle.trim() }).run();
		else editor.chain().focus().setTextSelection(selection).wrapIn('solution', { title: solutionTitle.trim() }).run();
		close();
	}
</script>

<svelte:window onpointerup={() => { pointerSelecting = false; }} onpointercancel={() => { pointerSelecting = false; }} />

<div class="rich-editor" {@attach animateExpansion} class:expanded aria-busy={uploading}>
	<div class="toolbar-reveal" inert={!expanded} aria-hidden={!expanded} style:grid-template-rows={expanded ? '1fr' : '0fr'}><div class="toolbar-clip">
	<div bind:this={toolbarNode} onpointerdown={keepToolbarFocus} class="editor-toolbar" role="toolbar" tabindex="-1" aria-label="Szövegformázás">
		<ActionMenu preserveFocus compact dense floating align="start" label="Szövegstílus" triggerIcon={Type} disabled={disabled} actions={[
			{ id: 'p', label: 'Normál szöveg', icon: Type, active: active('paragraph'), onclick: () => run((e) => e.chain().focus().setParagraph().run()) },
			{ id: 'h3', label: 'Alcím', icon: Type, active: snapshot?.editor.isActive('heading', { level: 3 }) ?? false, onclick: () => run((e) => e.chain().focus().toggleHeading({ level: 3 }).run()) },
			{ id: 'h4', label: 'Kisebb alcím', icon: Type, active: snapshot?.editor.isActive('heading', { level: 4 }) ?? false, onclick: () => run((e) => e.chain().focus().toggleHeading({ level: 4 }).run()) }
		]} />
		{#each [{ label: 'Félkövér', icon: Bold, mark: 'bold', command: (e: Editor) => e.chain().focus().toggleBold().run() }, { label: 'Dőlt', icon: Italic, mark: 'italic', command: (e: Editor) => e.chain().focus().toggleItalic().run() }] as tool (tool.mark)}
			<button type="button" class="tool" aria-label={tool.label} title={tool.label} aria-pressed={active(tool.mark)} disabled={disabled} onclick={() => run(tool.command)}><tool.icon size={18} /></button>
		{/each}
		<button type="button" class="tool" aria-label="Felsorolás" title="Felsorolás" aria-pressed={active('bulletList')} disabled={disabled} onclick={() => run((e) => e.chain().focus().toggleBulletList().run())}><List size={18} /></button>
		<button type="button" class="tool" aria-label="Link" title="Link" aria-pressed={active('link')} disabled={disabled} onclick={() => open('link')}><Link size={18} /></button>
		<ActionMenu preserveFocus closeOnSelect={false} dense menuIconsOnly menuColumns={5} floating align="start" compact label="További formázások" disabled={disabled} actions={[
			{ id: 'underline', label: 'Aláhúzás', icon: Underline, active: active('underline'), onclick: () => run((e) => e.chain().focus().toggleUnderline().run()) },
			{ id: 'strike', label: 'Áthúzás', icon: Strikethrough, active: active('strike'), onclick: () => run((e) => e.chain().focus().toggleStrike().run()) },
			{ id: 'highlight', label: 'Kiemelés', icon: Highlighter, active: active('highlight'), onclick: () => run((e) => e.chain().focus().toggleHighlight().run()) },
			{ id: 'sub', label: 'Alsó index', icon: Subscript, active: active('subscript'), onclick: () => run((e) => e.chain().focus().toggleSubscript().run()) },
			{ id: 'sup', label: 'Felső index', icon: Superscript, active: active('superscript'), onclick: () => run((e) => e.chain().focus().toggleSuperscript().run()) },
			{ id: 'ordered', label: 'Számozott lista', icon: ListOrdered, active: active('orderedList'), onclick: () => run((e) => e.chain().focus().toggleOrderedList().run()) },
			{ id: 'quote', label: 'Idézet', icon: Quote, active: active('blockquote'), onclick: () => run((e) => e.chain().focus().toggleBlockquote().run()) },
			{ id: 'code', label: 'Szövegközi kód', icon: Code, active: active('code'), onclick: () => run((e) => e.chain().focus().toggleCode().run()) },
			{ id: 'clear', label: 'Formázás törlése', icon: Eraser, onclick: () => run((e) => e.chain().focus().unsetAllMarks().clearNodes().run()) },
			{ id: 'unwrap', label: 'Doboz megszüntetése', icon: Ungroup, disabled: !active('callout') && !active('solution'), onclick: () => run((e) => e.chain().focus().lift(e.isActive('callout') ? 'callout' : 'solution').run()) }
		]} />
		{#if active('table')}
			<button bind:this={tableTrigger} type="button" class="tool table-trigger" aria-label="Táblázat műveletei" title="Táblázat műveletei" aria-haspopup="dialog" aria-expanded={tablePopover !== null && expanded} aria-controls={tablePopover && expanded ? `${id}-table-menu` : undefined} disabled={disabled} onclick={(event) => { if (tablePopover) tablePopover = null; else openTable(true, event.detail === 0); }}><Table size={18} aria-hidden="true" /></button>
		{/if}
		<div class="toolbar-spacer"></div>
		<button type="button" class="tool" aria-label="Visszavonás" title="Visszavonás" disabled={disabled || !snapshot?.editor.can().undo()} onclick={() => run((e) => e.chain().focus().undo().run())}><Undo2 size={18} /></button>
		<button type="button" class="tool" aria-label="Újraalkalmazás" title="Újraalkalmazás" disabled={disabled || !snapshot?.editor.can().redo()} onclick={() => run((e) => e.chain().focus().redo().run())}><Redo2 size={18} /></button>
		<div class="insert-menu"><ActionMenu preserveFocus dense floating align="end" label="Beszúrás" triggerLabel="Beszúrás" triggerIcon={Plus} disabled={disabled} actions={[
			{ id: 'image', label: 'Kép', icon: Image, onclick: () => open('image') },
			{ id: 'math', label: 'Matematikai képlet', icon: Sigma, onclick: () => open('math') },
			{ id: 'table', label: 'Táblázat', icon: Table, onclick: () => openTableInsert() },
			{ id: 'important', label: 'Fontos', icon: Info, onclick: () => callout('important') },
			{ id: 'example', label: 'Példa', icon: BookOpen, onclick: () => callout('example') },
			{ id: 'tip', label: 'Tipp', icon: Lightbulb, onclick: () => callout('tip') },
			{ id: 'solution', label: 'Lenyitható tartalom', icon: ChevronDown, onclick: () => open('solution') },
			{ id: 'codeblock', label: 'Kódblokk', icon: Code, onclick: () => run((e) => e.chain().focus().toggleCodeBlock().run()) },
			{ id: 'hr', label: 'Elválasztó', icon: Minus, onclick: () => run((e) => e.chain().focus().setHorizontalRule().run()) }
		]} /></div>
	</div>
	</div></div>
	<div class="document-viewport" style:height={`${expanded ? Math.max(documentHeight, 96) : Math.max(48, Math.min(documentHeight, 96))}px`}>
		<div bind:this={element} {@attach measureDocument} class="editor-document" onpointerdown={() => { pointerSelecting = true; }} onfocusin={() => { if (!pointerSelecting) activateDocument(); }} onclick={() => { pointerSelecting = false; activateDocument(); }} role="presentation"></div>
	</div>
</div>

<div use:portal>
	<Sheet open={tableInsertOpen} label="Táblázat beszúrása" title="Táblázat beszúrása" onClose={() => closeTableInsert()}>
		<form class="mt-4 space-y-4" onsubmit={applyTable}>
			<div class="grid grid-cols-2 gap-3">
				<div class="rounded-2xl border border-stone-200 p-3 dark:border-white/10">
					<p class="text-[13px] font-extrabold text-ink-900 dark:text-white">Sorok</p>
					<div class="mt-2 flex items-center gap-2">
						<button type="button" aria-label="Sorok csökkentése" disabled={rows <= 1} onclick={() => (rows = clampTableSize(rows - 1))} class="grid size-9 shrink-0 place-items-center rounded-full border border-stone-200 text-lg font-bold transition hover:bg-stone-100 active:scale-95 disabled:opacity-30 dark:border-white/15 dark:hover:bg-white/10">-</button>
						<input aria-label="Sorok száma" class="{fieldClass} text-center" type="number" min="1" max="12" bind:value={rows} required />
						<button type="button" aria-label="Sorok növelése" disabled={rows >= 12} onclick={() => (rows = clampTableSize(rows + 1))} class="grid size-9 shrink-0 place-items-center rounded-full border border-stone-200 text-lg font-bold transition hover:bg-stone-100 active:scale-95 disabled:opacity-30 dark:border-white/15 dark:hover:bg-white/10">+</button>
					</div>
				</div>
				<div class="rounded-2xl border border-stone-200 p-3 dark:border-white/10">
					<p class="text-[13px] font-extrabold text-ink-900 dark:text-white">Oszlopok</p>
					<div class="mt-2 flex items-center gap-2">
						<button type="button" aria-label="Oszlopok csökkentése" disabled={cols <= 1} onclick={() => (cols = clampTableSize(cols - 1))} class="grid size-9 shrink-0 place-items-center rounded-full border border-stone-200 text-lg font-bold transition hover:bg-stone-100 active:scale-95 disabled:opacity-30 dark:border-white/15 dark:hover:bg-white/10">-</button>
						<input aria-label="Oszlopok száma" class="{fieldClass} text-center" type="number" min="1" max="12" bind:value={cols} required />
						<button type="button" aria-label="Oszlopok növelése" disabled={cols >= 12} onclick={() => (cols = clampTableSize(cols + 1))} class="grid size-9 shrink-0 place-items-center rounded-full border border-stone-200 text-lg font-bold transition hover:bg-stone-100 active:scale-95 disabled:opacity-30 dark:border-white/15 dark:hover:bg-white/10">+</button>
					</div>
				</div>
			</div>
			<p class="text-[13px] font-medium text-stone-500 dark:text-stone-400">{rows} × {cols} táblázat, az első sor fejléccel.</p>
			<Button type="submit" block>Táblázat beszúrása</Button>
		</form>
	</Sheet>
	<Sheet open={modal !== null} canClose={!uploading} wide={modalKind === 'image'} label="Tartalom beszúrása" title={modalKind === 'image' ? 'Kép' : modalKind === 'math' ? 'Matematikai képlet' : modalKind === 'link' ? 'Hivatkozás' : 'Lenyitható tartalom'} onClose={close}>
		{#if modalKind === 'math'}
			<MathInput initial={latex} block={mathBlock} onApply={(value, block) => insert({ type: block ? 'blockMath' : 'inlineMath', attrs: { latex: value } })} onRemove={editPos === null ? undefined : removeNode} />
		{:else if modalKind === 'image'}
			<div class="mt-4 space-y-3">
				<label class="block rounded-xl border border-dashed border-stone-300 p-3 text-sm font-bold dark:border-white/20">{uploading ? 'Feltöltés…' : 'Kép feltöltése'}<input type="file" aria-label="Képfájl feltöltése" accept={QUESTION_IMAGE_TYPES.join(',')} disabled={uploading} onchange={upload} class="mt-2 block w-full text-xs" /><span class="mt-1 block text-xs font-normal text-stone-500">JPEG, PNG, WebP, GIF vagy AVIF, legfeljebb 10 MB</span></label>
				<label class="block text-sm font-bold" for={`${id}-image-url`}>Kép URL-je</label><input id={`${id}-image-url`} class={fieldClass} bind:value={src} disabled={uploading} maxlength={2048} placeholder="https://…" />
				{#if normalizeQuestionImageUrl(src)}<img src={normalizeQuestionImageUrl(src)!} alt="Kép előnézete" referrerpolicy="no-referrer" class="mx-auto max-h-44 max-w-full rounded-xl object-contain" />{/if}
				<label class="block text-sm font-bold" for={`${id}-caption`}>Képaláírás</label><input id={`${id}-caption`} class={fieldClass} bind:value={caption} maxlength={2000} disabled={uploading} />
				<label class="block text-sm font-bold" for={`${id}-alt`}>Kép leírása</label><input id={`${id}-alt`} class={fieldClass} bind:value={alt} maxlength={1000} disabled={uploading} placeholder="Rövid leírás képernyőolvasóhoz" />
				<fieldset disabled={uploading} class="flex flex-wrap gap-3 text-sm"><legend class="mb-1 font-bold">Szélesség</legend><label><input type="radio" bind:group={width} value="full" /> Teljes</label><label><input type="radio" bind:group={width} value="half" /> Fél</label></fieldset>
				{#if error}<p role="alert" class="text-sm text-red-600 dark:text-red-300">{error}</p>{/if}
				<div class="flex justify-end gap-2">{#if editPos !== null}<Button variant="ghost" disabled={uploading} onclick={removeNode}>Kép eltávolítása</Button>{/if}<Button disabled={uploading || !src.trim()} onclick={applyImage}>Kép használata</Button></div>
			</div>
		{:else if modalKind === 'link'}
			<form class="mt-4 space-y-3" onsubmit={(event) => { event.preventDefault(); applyLink(); }}>
				<label class="block text-sm font-bold" for={`${id}-href`}>Hivatkozás címe</label><input id={`${id}-href`} class={fieldClass} bind:value={href} placeholder="https://…" maxlength={2048} />
				{#if selection.from === selection.to && !active('link')}<label class="block text-sm font-bold" for={`${id}-link-text`}>Megjelenő szöveg</label><input id={`${id}-link-text`} class={fieldClass} bind:value={linkText} maxlength={2000} />{/if}
				{#if error}<p role="alert" class="text-sm text-red-600">{error}</p>{/if}
				<div class="flex justify-end gap-2">{#if active('link')}<Button variant="ghost" onclick={() => { editor?.chain().focus().setTextSelection(selection).extendMarkRange('link').unsetLink().run(); close(); }}>Link eltávolítása</Button>{/if}<Button type="submit">Hivatkozás használata</Button></div>
			</form>
		{:else if modalKind === 'solution'}
			<form class="mt-4 space-y-3" onsubmit={(event) => { event.preventDefault(); applySolution(); }}>
				<label class="block text-sm font-bold" for={`${id}-solution-title`}>Lenyitható rész címe</label><input id={`${id}-solution-title`} class={fieldClass} bind:value={solutionTitle} maxlength={160} required />
				<p class="text-sm text-stone-500">A kijelölt bekezdések lenyitható részbe kerülnek. A tartalmát ezután közvetlenül szerkesztheted.</p>
				{#if error}<p role="alert" class="text-sm text-red-600">{error}</p>{/if}<Button type="submit" block>Lenyitható rész használata</Button>
			</form>
		{/if}
	</Sheet>
</div>

{#if tablePopover && expanded && tableTrigger}
	<EditorPopover preserveFocus autoFocus={tableKeyboard} placement="below" id={`${id}-table-menu`} trigger={() => tableTrigger ?? null} label="Táblázat műveletei" anchor={tableMenuAnchor} onClose={(restoreFocus) => { tablePopover = null; if (restoreFocus) tableTrigger?.focus({ preventScroll: true }); }}>
			<div class="table-edit-menu">
				<div class="table-edit-head">
					<span class="table-edit-icon"><Table size={17} aria-hidden="true" /></span>
					<div class="min-w-0">
						<p class="table-menu-title">Táblázat</p>
						{#if tablePosition}<p class="table-position">{tablePosition}</p>{/if}
					</div>
				</div>
				<div class="table-actions" role="group" aria-label="Táblázat műveletei">
					{#each [
						{ title: 'Sor', tools: [
							{ label: 'Sor fölé', name: 'Sor hozzáadása felül', hint: 'Új sor a kijelölt sor fölé', icon: ArrowUp, command: (e: Editor) => e.chain().focus(undefined, { scrollIntoView: false }).addRowBefore().run() },
							{ label: 'Sor alá', name: 'Sor hozzáadása alul', hint: 'Új sor a kijelölt sor alá', icon: ArrowDown, command: (e: Editor) => e.chain().focus(undefined, { scrollIntoView: false }).addRowAfter().run() },
							{ label: 'Sor törlése', name: 'Sor törlése', hint: 'A kijelölt sor törlése a tartalmával együtt', danger: true, icon: Trash2, command: (e: Editor) => e.chain().focus(undefined, { scrollIntoView: false }).deleteRow().run() }
						] },
						{ title: 'Oszlop', tools: [
							{ label: 'Oszlop balra', name: 'Oszlop hozzáadása balra', hint: 'Új oszlop a kijelölt oszloptól balra', icon: ArrowLeft, command: (e: Editor) => e.chain().focus(undefined, { scrollIntoView: false }).addColumnBefore().run() },
							{ label: 'Oszlop jobbra', name: 'Oszlop hozzáadása jobbra', hint: 'Új oszlop a kijelölt oszloptól jobbra', icon: ArrowRight, command: (e: Editor) => e.chain().focus(undefined, { scrollIntoView: false }).addColumnAfter().run() },
							{ label: 'Oszlop törlése', name: 'Oszlop törlése', hint: 'A kijelölt oszlop törlése a tartalmával együtt', danger: true, icon: Trash2, command: (e: Editor) => e.chain().focus(undefined, { scrollIntoView: false }).deleteColumn().run() }
						] }
					] as group (group.title)}
						<div role="group" aria-label={group.title} class="table-group"><p class="table-group-title">{group.title}</p>
							{#each group.tools as tool (tool.name)}
								<button type="button" class={['table-action', { danger: tool.danger }]} aria-label={tool.name} title={tool.hint} onclick={() => runTable(tool.command)}><span class="table-action-icon"><tool.icon size={16} aria-hidden="true" /></span><span>{tool.label}</span></button>
							{/each}
						</div>
					{/each}
				</div>
				<div class="table-footer">
					<button type="button" class="table-action" aria-label="Fejléc be- vagy kikapcsolása" aria-pressed={tableHeader} title="Az első sor kiemelése fejlécként" onclick={() => runTable((e) => e.chain().focus(undefined, { scrollIntoView: false }).toggleHeaderRow().run())}><span class="table-action-icon">{#if tableHeader}<Check size={16} aria-hidden="true" />{:else}<Type size={16} aria-hidden="true" />{/if}</span><span>Fejléc</span></button>
					<button type="button" class="table-action danger" aria-label="Táblázat törlése" title="A teljes táblázat törlése a tartalmával együtt" onclick={() => runTable((e) => e.chain().focus(undefined, { scrollIntoView: false }).deleteTable().run())}><span class="table-action-icon"><Trash2 size={16} aria-hidden="true" /></span><span>Tábla törlése</span></button>
				</div>
			</div>
	</EditorPopover>
{/if}

<style>
	.rich-editor { padding: 12px; min-width: 0; border: 1px solid var(--color-stone-200); border-radius: 14px; transition: border-color 180ms ease-out; }
	:global(.dark) .rich-editor { border-color: rgb(255 255 255 / .15); }
	.editor-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; padding: 5px; border-bottom: 1px solid rgb(120 113 108 / .15); }
	.editor-toolbar :global(.action-button) { min-height: 34px; border: none; border-radius: 8px; padding: 6px 9px; font-size: 12px; gap: 5px; }
	.editor-toolbar :global(.compact .toggle) { width: 34px; height: 34px; }
	.tool { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 8px; color: var(--color-stone-600); }
	:global(.dark) .tool { color: var(--color-stone-300); }
	.tool:hover { background: rgb(120 113 108 / .08); }
	.tool[aria-pressed='true'] { background: var(--color-brand-50); color: var(--color-brand-600); }
	:global(.dark) .tool[aria-pressed='true'] { background: rgb(99 102 241 / .2); color: var(--color-brand-300); }
	.tool:disabled { opacity: .35; }
	.tool:focus-visible { outline: 2px solid var(--color-brand-500); outline-offset: 1px; }
	.table-trigger { width: 34px; padding: 0; }
	.table-trigger[aria-expanded='true'] { background: var(--color-brand-50); color: var(--color-brand-600); }
	:global(.dark) .table-trigger[aria-expanded='true'] { background: rgb(99 102 241 / .2); color: var(--color-brand-300); }
	.toolbar-spacer { flex: 1; }
	.toolbar-reveal { display: grid; transition: grid-template-rows 260ms cubic-bezier(.65, 0, .35, 1), opacity 180ms ease-out; opacity: 0; }
	.expanded .toolbar-reveal { opacity: 1; }
	.toolbar-clip { overflow: clip; min-height: 0; }
	.editor-toolbar { padding: 0 0 6px; margin-bottom: 8px; }
	.document-viewport { overflow: clip; }
	.rich-editor:global([data-resizing]) .document-viewport { transition: height 260ms cubic-bezier(.65, 0, .35, 1); }
	:global(.reduce-motion) .rich-editor, :global(.reduce-motion) .toolbar-reveal, :global(.reduce-motion) .rich-editor:global([data-resizing]) .document-viewport { transition: none; }
	.editor-document :global(.lesson-editable) { min-height: 48px; outline: none; line-height: 24px; font-size: 14px; }
	.expanded .editor-document :global(.lesson-editable) { min-height: 96px; }
	.editor-document :global(p) { margin: 0; min-height: 24px; }
	.rich-editor.expanded { border-color: color-mix(in srgb, var(--color-stone-200) 75%, white); }
	:global(.dark) .rich-editor.expanded { border-color: rgb(255 255 255 / .25); }
	.editor-document :global(.ProseMirror-focused) { caret-color: currentColor; }
	.editor-document :global(.ProseMirror-selectednode) { outline: 2px solid var(--color-brand-400); border-radius: 8px; }
	.editor-document :global(.selectedCell) { background: rgb(99 102 241 / .15); }
	.editor-document :global(.editor-retained-selection) { background: rgb(99 102 241 / .23); }
	.editor-document :global(.editor-retained-caret) { display: inline-block; width: 0; height: 1em; border-left: 2px solid currentColor; margin-left: -1px; vertical-align: text-bottom; pointer-events: none; }
	.editor-document :global(.editor-retained-node) { outline: 2px solid var(--color-brand-400); border-radius: 8px; }
	.editor-document :global([data-callout]::before) { display: block; font-weight: 700; font-size: .85em; }
	.editor-document :global([data-callout='important']::before) { content: 'Fontos'; }
	.editor-document :global([data-callout='example']::before) { content: 'Példa'; }
	.editor-document :global([data-callout='tip']::before) { content: 'Tipp'; }
	.editor-document :global(figure) { cursor: pointer; }
	.editor-document :global(.tiptap-mathematics-render) { cursor: pointer; border-radius: 4px; }
	.editor-document :global(.tiptap-mathematics-render:hover) { background: rgb(99 102 241 / .08); }
	.editor-document :global([data-type='block-math']) { overflow-x: auto; max-width: 100%; }
	.table-edit-menu { width: 248px; max-width: calc(100vw - 32px); }
	.table-edit-head { display: flex; align-items: center; gap: 10px; padding: 6px 6px 8px; }
	.table-edit-icon { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; background: var(--color-brand-50); color: var(--color-brand-600); }
	:global(.dark) .table-edit-icon { background: rgb(99 102 241 / .2); color: var(--color-brand-300); }
	.table-menu-title { font-size: 13px; font-weight: 800; color: var(--color-ink-900); line-height: 1.2; }
	:global(.dark) .table-menu-title { color: white; }
	.table-position { color: var(--color-stone-500); font-size: 11px; font-weight: 500; line-height: 1.3; }
	.table-group { padding: 2px 0; }
	.table-group + .table-group { margin-top: 2px; padding-top: 6px; border-top: 1px solid rgb(120 113 108 / .12); }
	:global(.dark) .table-group + .table-group { border-color: rgb(255 255 255 / .08); }
	.table-group-title { padding: 4px 8px; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--color-stone-400); }
	.table-actions { display: grid; gap: 1px; }
	.table-footer { display: grid; gap: 1px; margin-top: 4px; padding-top: 5px; border-top: 1px solid rgb(120 113 108 / .12); }
	:global(.dark) .table-footer { border-color: rgb(255 255 255 / .08); }
	.table-action { display: flex; align-items: center; width: 100%; gap: 10px; min-height: 38px; padding: 7px 8px; border-radius: 10px; text-align: left; font-size: 13px; font-weight: 700; color: var(--color-stone-600); transition: background-color 150ms; }
	.table-action-icon { display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; border-radius: 8px; background: rgb(120 113 108 / .1); }
	.table-action-icon :global(svg) { width: 15px; height: 15px; }
	.table-action:hover { background: var(--color-stone-100); }
	.table-action:hover .table-action-icon { background: rgb(120 113 108 / .16); }
	.table-action[aria-pressed='true'] { background: var(--color-brand-50); color: var(--color-brand-600); }
	.table-action[aria-pressed='true'] .table-action-icon { background: rgb(99 102 241 / .15); color: var(--color-brand-600); }
	.table-action:focus-visible { outline: 2px solid var(--color-brand-400); outline-offset: -2px; }
	.table-action.danger { color: var(--color-red-600); }
	.table-action.danger .table-action-icon { background: rgb(239 68 68 / .1); color: currentColor; }
	.table-action.danger:hover { background: var(--color-red-50); }
	:global(.dark) .table-action { color: var(--color-stone-200); }
	:global(.dark) .table-action-icon { background: rgb(255 255 255 / .08); }
	:global(.dark) .table-action:hover { background: rgb(255 255 255 / .06); }
	:global(.dark) .table-position, :global(.dark) .table-group-title { color: var(--color-stone-400); }
	:global(.dark) .table-action[aria-pressed='true'] { background: rgb(99 102 241 / .2); color: var(--color-brand-300); }
	:global(.dark) .table-action[aria-pressed='true'] .table-action-icon { color: var(--color-brand-300); }
	:global(.dark) .table-action.danger { color: var(--color-red-400); }
	:global(.dark) .table-action.danger:hover { background: rgb(239 68 68 / .12); }
	:global(.dark) .table-footer { border-color: rgb(255 255 255 / .1); }
	@media (prefers-reduced-motion: reduce) { .rich-editor, .toolbar-reveal, .rich-editor:global([data-resizing]) .document-viewport { transition: none; } }
	@media (max-width: 767px) {
		.expanded .toolbar-reveal { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 35; background: white; }
		:global(.dark) .expanded .toolbar-reveal { background: var(--color-stone-900); }
		.table-action { min-height: 32px; }
	}
	@media (max-width: 420px) { .toolbar-spacer { display: none; } }
	@media (max-width: 560px) {
		.insert-menu :global(.action-button.toggle) { width: 34px; height: 34px; padding: 0; }
		.insert-menu :global(.action-button.toggle span) { display: none; }
	}
</style>
