<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Editor } from '@tiptap/core';
	import { Bold, Italic, List, ListOrdered, Link, Plus, Undo2, Redo2, Type, Highlighter, Underline, Strikethrough, Subscript, Superscript, Image, Sigma, Table, Info, Lightbulb, BookOpen, ChevronDown, Code, Quote, Minus, Trash2, ArrowDown, ArrowRight } from '@lucide/svelte';
	import ActionMenu from '$lib/ui/ActionMenu.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import { normalizeQuestionImageUrl, MAX_QUESTION_IMAGE_BYTES, QUESTION_IMAGE_TYPES } from '$lib/question-image';
	import { safeLessonLink, type LessonNode } from '$lib/lesson-content';
	import { lessonEditorExtensions } from './lesson-editor-extensions';
	import MathInput from './MathInput.svelte';
	import './lesson-content.css';
	import 'katex/dist/katex.min.css';

	let { initialDoc, lessonId, disabled = false, onChange, onBusyChange }: {
		initialDoc: LessonNode; lessonId: string; disabled?: boolean;
		onChange: (doc: LessonNode) => void; onBusyChange: (busy: boolean) => void;
	} = $props();
	const initial = untrack(() => initialDoc);
	const id = $props.id();
	let element: HTMLDivElement;
	let editor: Editor | undefined;
	let snapshot = $state.raw<{ editor: Editor } | null>(null);
	let modal = $state<'image' | 'math' | 'link' | 'solution' | 'table' | null>(null);
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
	let rows = $state(3);
	let cols = $state(3);
	const fieldClass = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5';

	onMount(() => {
		editor = new Editor({
			element, content: initial, editable: !disabled,
			extensions: lessonEditorExtensions(
				(pos, value, block) => { open('math', pos); latex = value; mathBlock = block; },
				(pos) => { open('image', pos); const a = editor!.state.doc.nodeAt(pos)!.attrs; src = a.src; alt = a.alt; caption = a.caption; width = a.width; },
				(pos, title) => { open('solution', pos); solutionTitle = title; }
			),
			editorProps: { attributes: { class: 'lesson-prose lesson-editable', role: 'textbox', 'aria-label': 'Bekezdés tartalma', 'aria-multiline': 'true', spellcheck: 'true' } },
			onTransaction: ({ editor: e }) => { snapshot = { editor: e }; },
			onUpdate: ({ editor: e }) => onChange(e.getJSON() as LessonNode)
		});
		snapshot = { editor };
		return () => { editor?.destroy(); };
	});
	$effect(() => { const editable = !disabled; untrack(() => editor?.setEditable(editable, false)); });
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

<div class="rich-editor" aria-busy={uploading}>
	<div class="editor-toolbar" role="toolbar" aria-label="Szövegformázás">
		<ActionMenu floating align="start" label="Szövegstílus" triggerLabel="Szöveg" triggerIcon={Type} disabled={disabled} actions={[
			{ id: 'p', label: 'Normál szöveg', icon: Type, onclick: () => run((e) => e.chain().focus().setParagraph().run()) },
			{ id: 'h3', label: 'Alcím', icon: Type, onclick: () => run((e) => e.chain().focus().toggleHeading({ level: 3 }).run()) },
			{ id: 'h4', label: 'Kisebb alcím', icon: Type, onclick: () => run((e) => e.chain().focus().toggleHeading({ level: 4 }).run()) }
		]} />
		{#each [{ label: 'Félkövér', icon: Bold, mark: 'bold', command: (e: Editor) => e.chain().focus().toggleBold().run() }, { label: 'Dőlt', icon: Italic, mark: 'italic', command: (e: Editor) => e.chain().focus().toggleItalic().run() }] as tool (tool.mark)}
			<button type="button" class="tool" aria-label={tool.label} title={tool.label} aria-pressed={active(tool.mark)} disabled={disabled} onclick={() => run(tool.command)}><tool.icon size={18} /></button>
		{/each}
		<button type="button" class="tool" aria-label="Felsorolás" title="Felsorolás" aria-pressed={active('bulletList')} disabled={disabled} onclick={() => run((e) => e.chain().focus().toggleBulletList().run())}><List size={18} /></button>
		<button type="button" class="tool" aria-label="Link" title="Link" aria-pressed={active('link')} disabled={disabled} onclick={() => open('link')}><Link size={18} /></button>
		<ActionMenu floating align="start" compact label="További formázások" disabled={disabled} actions={[
			{ id: 'underline', label: 'Aláhúzás', icon: Underline, onclick: () => run((e) => e.chain().focus().toggleUnderline().run()) },
			{ id: 'strike', label: 'Áthúzás', icon: Strikethrough, onclick: () => run((e) => e.chain().focus().toggleStrike().run()) },
			{ id: 'highlight', label: 'Kiemelés', icon: Highlighter, onclick: () => run((e) => e.chain().focus().toggleHighlight().run()) },
			{ id: 'sub', label: 'Alsó index', icon: Subscript, onclick: () => run((e) => e.chain().focus().toggleSubscript().run()) },
			{ id: 'sup', label: 'Felső index', icon: Superscript, onclick: () => run((e) => e.chain().focus().toggleSuperscript().run()) },
			{ id: 'ordered', label: 'Számozott lista', icon: ListOrdered, onclick: () => run((e) => e.chain().focus().toggleOrderedList().run()) },
			{ id: 'quote', label: 'Idézet', icon: Quote, onclick: () => run((e) => e.chain().focus().toggleBlockquote().run()) },
			{ id: 'code', label: 'Szövegközi kód', icon: Code, onclick: () => run((e) => e.chain().focus().toggleCode().run()) },
			{ id: 'clear', label: 'Formázás törlése', icon: Type, onclick: () => run((e) => e.chain().focus().unsetAllMarks().clearNodes().run()) },
			{ id: 'unwrap', label: 'Kiemelődoboz vagy lenyitás megszüntetése', icon: Minus, disabled: !active('callout') && !active('solution'), onclick: () => run((e) => e.chain().focus().lift(e.isActive('callout') ? 'callout' : 'solution').run()) }
		]} />
		<div class="toolbar-spacer"></div>
		<button type="button" class="tool" aria-label="Visszavonás" title="Visszavonás" disabled={disabled || !snapshot?.editor.can().undo()} onclick={() => run((e) => e.chain().focus().undo().run())}><Undo2 size={18} /></button>
		<button type="button" class="tool" aria-label="Újraalkalmazás" title="Újraalkalmazás" disabled={disabled || !snapshot?.editor.can().redo()} onclick={() => run((e) => e.chain().focus().redo().run())}><Redo2 size={18} /></button>
		<ActionMenu floating align="end" label="Beszúrás" triggerLabel="Beszúrás" triggerIcon={Plus} disabled={disabled} actions={[
			{ id: 'image', label: 'Kép', icon: Image, onclick: () => open('image') },
			{ id: 'math', label: 'Matematikai képlet', icon: Sigma, onclick: () => open('math') },
			{ id: 'table', label: 'Táblázat', icon: Table, onclick: () => open('table') },
			{ id: 'important', label: 'Fontos', icon: Info, onclick: () => callout('important') },
			{ id: 'example', label: 'Példa', icon: BookOpen, onclick: () => callout('example') },
			{ id: 'tip', label: 'Tipp', icon: Lightbulb, onclick: () => callout('tip') },
			{ id: 'solution', label: 'Lenyitható tartalom', icon: ChevronDown, onclick: () => open('solution') },
			{ id: 'codeblock', label: 'Kódblokk', icon: Code, onclick: () => run((e) => e.chain().focus().toggleCodeBlock().run()) },
			{ id: 'hr', label: 'Elválasztó', icon: Minus, onclick: () => run((e) => e.chain().focus().setHorizontalRule().run()) }
		]} />
	</div>
	{#if active('table')}
		<div class="table-tools">
			<ActionMenu floating align="start" label="Táblázat műveletei" triggerLabel="Táblázat" triggerIcon={Table} disabled={disabled} actions={[
				{ id: 'row', label: 'Sor hozzáadása alul', icon: ArrowDown, onclick: () => run((e) => e.chain().focus().addRowAfter().run()) },
				{ id: 'col', label: 'Oszlop hozzáadása jobbra', icon: ArrowRight, onclick: () => run((e) => e.chain().focus().addColumnAfter().run()) },
				{ id: 'header', label: 'Fejléc be- vagy kikapcsolása', icon: Type, onclick: () => run((e) => e.chain().focus().toggleHeaderRow().run()) },
				{ id: 'delete-row', label: 'Sor törlése', icon: Trash2, onclick: () => run((e) => e.chain().focus().deleteRow().run()) },
				{ id: 'delete-col', label: 'Oszlop törlése', icon: Trash2, onclick: () => run((e) => e.chain().focus().deleteColumn().run()) },
				{ id: 'delete-table', label: 'Táblázat törlése', icon: Trash2, tone: 'danger', onclick: () => run((e) => e.chain().focus().deleteTable().run()) }
			]} />
		</div>
	{/if}
	<div bind:this={element} class="editor-document"></div>
</div>

<div use:portal>
	<Sheet open={modal !== null} canClose={!uploading} wide label="Tartalom beszúrása" title={modalKind === 'image' ? 'Kép' : modalKind === 'math' ? 'Matematikai képlet' : modalKind === 'link' ? 'Hivatkozás' : modalKind === 'table' ? 'Táblázat' : 'Lenyitható tartalom'} onClose={close}>
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
		{:else if modalKind === 'table'}
			<form class="mt-4 space-y-3" onsubmit={(event) => { event.preventDefault(); if (!editor || !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 12 || cols > 12) return; editor.chain().focus().setTextSelection(selection).insertTable({ rows, cols, withHeaderRow: true }).run(); close(); }}>
				<label class="block text-sm font-bold" for={`${id}-rows`}>Sorok száma</label><input id={`${id}-rows`} class={fieldClass} type="number" min="1" max="12" bind:value={rows} required />
				<label class="block text-sm font-bold" for={`${id}-cols`}>Oszlopok száma</label><input id={`${id}-cols`} class={fieldClass} type="number" min="1" max="12" bind:value={cols} required />
				<Button type="submit" block>Táblázat beszúrása</Button>
			</form>
		{/if}
	</Sheet>
</div>

<style>
	.rich-editor { min-width: 0; border: 1px solid var(--color-stone-200); border-radius: 14px; }
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
	.toolbar-spacer { flex: 1; }
	.editor-document { padding: 12px 14px; }
	.editor-document :global(.lesson-editable) { min-height: 150px; outline: none; }
	.editor-document :global(.ProseMirror-focused) { caret-color: var(--color-brand-600); }
	.editor-document :global(.ProseMirror-selectednode) { outline: 2px solid var(--color-brand-400); border-radius: 8px; }
	.editor-document :global(.selectedCell) { background: rgb(99 102 241 / .15); }
	.editor-document :global([data-callout]::before) { display: block; font-weight: 700; font-size: .85em; }
	.editor-document :global([data-callout='important']::before) { content: 'Fontos'; }
	.editor-document :global([data-callout='example']::before) { content: 'Példa'; }
	.editor-document :global([data-callout='tip']::before) { content: 'Tipp'; }
	.editor-document :global(figure) { cursor: pointer; }
	.editor-document :global(.tiptap-mathematics-render) { cursor: pointer; border-radius: 4px; }
	.editor-document :global(.tiptap-mathematics-render:hover) { background: rgb(99 102 241 / .08); }
	.editor-document :global([data-type='block-math']) { overflow-x: auto; max-width: 100%; }
	.table-tools { padding: 4px 8px; border-bottom: 1px solid rgb(120 113 108 / .15); }
	@media (max-width: 420px) { .toolbar-spacer { display: none; } }
</style>
