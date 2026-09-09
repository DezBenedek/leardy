<script module lang="ts">
	import type { AssessmentItem } from '$lib/study';

	export interface QOptRow {
		text: string;
		correct: boolean;
	}
	export interface QPairRow {
		left: string;
		right: string;
	}
	export interface QFormValue {
		text: string;
		type: string;
		options: QOptRow[];
		pairs: QPairRow[];
		order: string[];
		correctText: string;
	}
	export interface QPayload {
		question_text: string;
		type: string;
		options: string[];
		left: string;
		correct_answer: string;
		pairs?: { left: string; right: string }[];
	}

	export const QTYPES = [
		{ id: 'choice', label: 'Feleletválasztós' },
		{ id: 'text', label: 'Beírós' },
		{ id: 'match', label: 'Párosítós' },
		{ id: 'order', label: 'Sorrendbe rakós' },
		{ id: 'tf', label: 'Igaz / hamis' }
	];

	export function typeLabel(t: string): string {
		return QTYPES.find((x) => x.id === t)?.label ?? t;
	}

	export function blankQForm(): QFormValue {
		return {
			text: '',
			type: 'choice',
			options: [
				{ text: '', correct: true },
				{ text: '', correct: false },
				{ text: '', correct: false }
			],
			pairs: [
				{ left: '', right: '' },
				{ left: '', right: '' }
			],
			order: ['', ''],
			correctText: ''
		};
	}

	/** Nyers tárolt sor -> szerkesztő-állapot (régi egy-páros formátumot is ért). */
	export function qFormFromItem(item: AssessmentItem): QFormValue {
		const v = blankQForm();
		v.text = item.question_text;
		v.type = item.type;
		try {
			const p: unknown = JSON.parse(item.options_json);
			if (item.type === 'match' && p && typeof p === 'object' && !Array.isArray(p)) {
				const m = p as { left?: string; options?: string[]; answer?: string; pairs?: { left?: string; right?: string }[] };
				if (Array.isArray(m.pairs) && m.pairs.length > 0) {
					v.pairs = m.pairs.map((x) => ({ left: String(x?.left ?? ''), right: String(x?.right ?? '') }));
				} else {
					v.pairs = [
						{ left: String(m.left ?? ''), right: String(m.answer ?? item.correct_answer) },
						{ left: '', right: '' }
					];
				}
			} else if (Array.isArray(p)) {
				if (item.type === 'order') {
					v.order = p.map(String);
				} else if (item.type === 'tf') {
					v.options = [
						{ text: 'Igaz', correct: item.correct_answer !== 'Hamis' },
						{ text: 'Hamis', correct: item.correct_answer === 'Hamis' }
					];
				} else {
					const arr = p.map(String);
					v.options = arr.map((t) => ({ text: t, correct: t === item.correct_answer }));
					if (!v.options.some((o) => o.correct) && v.options.length > 0) v.options[0].correct = true;
				}
			}
		} catch {
			// üres űrlap marad
		}
		if (item.type === 'text') v.correctText = item.correct_answer;
		return v;
	}

	/** Hány pár van egy tárolt párosítós sorban (listanézethez). */
	export function pairCountOf(item: { type: string; options_json: string; correct_answer: string }): number {
		if (item.type !== 'match') return 0;
		try {
			const p = JSON.parse(item.options_json) as { pairs?: unknown[]; left?: string };
			if (Array.isArray(p?.pairs)) return p.pairs.length;
			if (typeof p?.left === 'string') return 1;
		} catch {
			// 0
		}
		return 0;
	}

	export function validateQForm(v: QFormValue): string | null {
		if (!v.text.trim()) return 'Add meg a kérdés szövegét.';
		if (v.type === 'choice' || v.type === 'tf') {
			const filled = v.options.filter((o) => o.text.trim());
			if (filled.length < 2) return 'Adj meg legalább 2 opciót.';
			const ticked = v.options.find((o) => o.correct);
			if (!ticked || !ticked.text.trim()) return 'Pipáld be a helyes választ.';
		} else if (v.type === 'match') {
			const done = v.pairs.filter((x) => x.left.trim() && x.right.trim());
			if (done.length < 2) return 'Vegyél fel legalább 2 párt, mindkét oldalt kitöltve.';
		} else if (v.type === 'order') {
			if (v.order.filter((x) => x.trim()).length < 2) return 'Adj meg legalább 2 sort helyes sorrendben.';
		} else if (v.type === 'text') {
			if (!v.correctText.trim()) return 'Add meg a helyes választ.';
		}
		return null;
	}

	export function serializeQForm(v: QFormValue): QPayload {
		const question_text = v.text.trim();
		if (v.type === 'match') {
			const pairs = v.pairs
				.map((x) => ({ left: x.left.trim(), right: x.right.trim() }))
				.filter((x) => x.left && x.right);
			return { question_text, type: 'match', options: [], left: '', correct_answer: pairs[0]?.right ?? '', pairs };
		}
		if (v.type === 'order') {
			const options = v.order.map((x) => x.trim()).filter(Boolean);
			return { question_text, type: 'order', options, left: '', correct_answer: '' };
		}
		if (v.type === 'text') {
			return { question_text, type: 'text', options: [], left: '', correct_answer: v.correctText.trim() };
		}
		if (v.type === 'tf') {
			const ticked = v.options.find((o) => o.correct);
			return {
				question_text,
				type: 'tf',
				options: ['Igaz', 'Hamis'],
				left: '',
				correct_answer: ticked?.text === 'Hamis' ? 'Hamis' : 'Igaz'
			};
		}
		const options = v.options.map((o) => o.text.trim()).filter(Boolean);
		const ticked = v.options.find((o) => o.correct);
		return { question_text, type: 'choice', options, left: '', correct_answer: ticked?.text.trim() ?? '' };
	}
</script>

<script lang="ts">
	import { ArrowDown, ArrowLeftRight, ArrowUp, Check, Plus, X } from '@lucide/svelte';

	interface Props {
		value: QFormValue;
	}

	let { value = $bindable() }: Props = $props();

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white';

	function switchType(t: string) {
		value.type = t;
		if (t === 'choice' && value.options.length === 0) {
			value.options = [
				{ text: '', correct: true },
				{ text: '', correct: false },
				{ text: '', correct: false }
			];
		}
		if (t === 'tf') {
			const wasFalse = value.options.find((o) => o.correct)?.text === 'Hamis';
			value.options = [
				{ text: 'Igaz', correct: !wasFalse },
				{ text: 'Hamis', correct: wasFalse }
			];
		}
		if (t === 'match' && value.pairs.length < 2) {
			while (value.pairs.length < 2) value.pairs = [...value.pairs, { left: '', right: '' }];
		}
		if (t === 'order' && value.order.length < 2) {
			while (value.order.length < 2) value.order = [...value.order, ''];
		}
	}

	function markCorrect(i: number) {
		value.options = value.options.map((o, j) => ({ ...o, correct: j === i }));
	}

	function addOption() {
		value.options = [...value.options, { text: '', correct: false }];
	}

	function removeOption(i: number) {
		if (value.options.length <= 2) return;
		const wasCorrect = value.options[i]?.correct;
		value.options = value.options.filter((_, j) => j !== i);
		if (wasCorrect && !value.options.some((o) => o.correct)) {
			const first = value.options.findIndex((o) => o.text.trim());
			if (first >= 0) {
				const c = [...value.options];
				c[first] = { ...c[first], correct: true };
				value.options = c;
			} else {
				value.options = value.options.map((o, j) => ({ ...o, correct: j === 0 }));
			}
		}
	}

	function addPair() {
		if (value.pairs.length >= 12) return;
		value.pairs = [...value.pairs, { left: '', right: '' }];
	}

	function removePair(i: number) {
		if (value.pairs.length <= 2) return;
		value.pairs = value.pairs.filter((_, j) => j !== i);
	}

	function addRow() {
		if (value.order.length >= 12) return;
		value.order = [...value.order, ''];
	}

	function removeRow(i: number) {
		if (value.order.length <= 2) return;
		value.order = value.order.filter((_, j) => j !== i);
	}

	function moveRow(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= value.order.length) return;
		const c = [...value.order];
		[c[i], c[j]] = [c[j], c[i]];
		value.order = c;
	}
</script>

<label class="block text-[13px] font-semibold text-ink-900 dark:text-white">
	Típus
	<select bind:value={value.type} onchange={() => switchType(value.type)} aria-label="Kérdés típusa" class="mt-1 {input}">
		{#each QTYPES as t (t.id)}
			<option value={t.id}>{t.label}</option>
		{/each}
	</select>
</label>

<label class="mt-2.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
	Kérdés
	<input bind:value={value.text} placeholder="Kérdés szövege" aria-label="Kérdés szövege" class="mt-1 {input}" />
</label>

{#if value.type === 'choice' || value.type === 'tf'}
	<p class="mt-3 text-[13px] font-semibold text-ink-900 dark:text-white">
		Opciók <span class="font-normal text-stone-400">— pipáld be a helyes választ</span>
	</p>
	<ul class="mt-1.5 space-y-1.5">
		{#each value.options as o, i (i)}
			<li class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => markCorrect(i)}
					aria-pressed={o.correct}
					aria-label="{i + 1}. opció megjelölése helyesként"
					class={['grid size-7 shrink-0 place-items-center rounded-lg border-2 transition active:scale-90', o.correct ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 text-transparent dark:border-white/20']}
				>
					<Check size={16} strokeWidth={3.5} />
				</button>
				<input
					bind:value={value.options[i].text}
					placeholder="{i + 1}. opció"
					aria-label="{i + 1}. opció szövege"
					disabled={value.type === 'tf'}
					class="{input} min-w-0 flex-1 {value.type === 'tf' ? 'opacity-70' : ''}"
				/>
				{#if value.type === 'choice'}
					<button
						type="button"
						onclick={() => removeOption(i)}
						disabled={value.options.length <= 2}
						aria-label="{i + 1}. opció törlése"
						class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:text-red-600 disabled:opacity-30 dark:hover:text-red-300"
					>
						<X size={15} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
	{#if value.type === 'choice'}
		<button
			type="button"
			onclick={addOption}
			class="mt-1.5 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 py-2 text-[13px] font-bold text-stone-500 transition hover:border-brand-500 hover:text-brand-600 dark:border-white/15 dark:text-stone-400"
		>
			<Plus size={14} /> Opció
		</button>
	{/if}
{:else if value.type === 'match'}
	<p class="mt-3 text-[13px] font-semibold text-ink-900 dark:text-white">
		Párok <span class="font-normal text-stone-400">— mindegyik külön kérdés lesz</span>
	</p>
	<ul class="mt-1.5 space-y-1.5">
		{#each value.pairs as p, i (i)}
			<li class="flex items-center gap-1.5">
				<input
					bind:value={value.pairs[i].left}
					placeholder="Bal oldal"
					aria-label="{i + 1}. pár bal oldala"
					class="{input} min-w-0 flex-1"
				/>
				<span class="grid size-7 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-400 dark:bg-white/10 dark:text-stone-500">
					<ArrowLeftRight size={14} />
				</span>
				<input
					bind:value={value.pairs[i].right}
					placeholder="Jobb oldal"
					aria-label="{i + 1}. pár jobb oldala"
					class="{input} min-w-0 flex-1"
				/>
				<button
					type="button"
					onclick={() => removePair(i)}
					disabled={value.pairs.length <= 2}
					aria-label="{i + 1}. pár törlése"
					class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:text-red-600 disabled:opacity-30 dark:hover:text-red-300"
				>
					<X size={15} />
				</button>
			</li>
		{/each}
	</ul>
	<button
		type="button"
		onclick={addPair}
		class="mt-1.5 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 py-2 text-[13px] font-bold text-stone-500 transition hover:border-brand-500 hover:text-brand-600 dark:border-white/15 dark:text-stone-400"
	>
		<Plus size={14} /> Pár
	</button>
{:else if value.type === 'order'}
	<p class="mt-3 text-[13px] font-semibold text-ink-900 dark:text-white">
		Sorrend <span class="font-normal text-stone-400">— fentről lefelé a helyes</span>
	</p>
	<ul class="mt-1.5 space-y-1.5">
		{#each value.order as row, i (i)}
			<li class="flex items-center gap-1.5">
				<span class="grid size-7 shrink-0 place-items-center rounded-lg bg-stone-100 text-[12px] font-extrabold text-stone-500 tabular-nums dark:bg-white/10 dark:text-stone-300">{i + 1}</span>
				<input
					bind:value={value.order[i]}
					placeholder="{i + 1}. elem"
					aria-label="{i + 1}. elem a sorrendben"
					class="{input} min-w-0 flex-1"
				/>
				<span class="flex shrink-0">
					<button
						type="button"
						onclick={() => moveRow(i, -1)}
						disabled={i === 0}
						aria-label="{i + 1}. elem feljebb"
						class="grid size-7 place-items-center rounded-full text-stone-400 transition hover:text-ink-900 disabled:opacity-30 dark:hover:text-white"
					>
						<ArrowUp size={15} />
					</button>
					<button
						type="button"
						onclick={() => moveRow(i, 1)}
						disabled={i === value.order.length - 1}
						aria-label="{i + 1}. elem lejjebb"
						class="grid size-7 place-items-center rounded-full text-stone-400 transition hover:text-ink-900 disabled:opacity-30 dark:hover:text-white"
					>
						<ArrowDown size={15} />
					</button>
				</span>
				<button
					type="button"
					onclick={() => removeRow(i)}
					disabled={value.order.length <= 2}
					aria-label="{i + 1}. elem törlése"
					class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:text-red-600 disabled:opacity-30 dark:hover:text-red-300"
				>
					<X size={15} />
				</button>
			</li>
		{/each}
	</ul>
	<button
		type="button"
		onclick={addRow}
		class="mt-1.5 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 py-2 text-[13px] font-bold text-stone-500 transition hover:border-brand-500 hover:text-brand-600 dark:border-white/15 dark:text-stone-400"
	>
		<Plus size={14} /> Sor
	</button>
{:else}
	<label class="mt-2.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
		Helyes válasz
		<input bind:value={value.correctText} placeholder="Helyes válasz" aria-label="Helyes válasz" class="mt-1 {input}" />
	</label>
{/if}
