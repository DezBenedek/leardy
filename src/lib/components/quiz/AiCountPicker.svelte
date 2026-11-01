<script lang="ts">
	import { Minus, Plus } from '@lucide/svelte';

	/* Beírható darabszám léptetővel: közvetlen számbevitel és -/+ gombok. */

	interface Props {
		value?: number;
		max?: number;
		min?: number;
		disabled?: boolean;
		label?: string;
	}

	let { value = $bindable(6), max = 10, min = 1, disabled = false, label = 'Darabszám' }: Props = $props();

	function clamp(n: number): number {
		if (!Number.isFinite(n)) return min;
		return Math.min(max, Math.max(min, Math.floor(n)));
	}

	function shift(delta: number) {
		if (!disabled) value = clamp((value ?? min) + delta);
	}

	function onInput(event: Event) {
		const raw = (event.currentTarget as HTMLInputElement).value;
		// Írás közben az üres mező megmaradhat, rögzítéskor vágunk.
		if (raw.trim() === '') return;
		const n = Number(raw);
		if (Number.isInteger(n)) value = clamp(n);
	}

	function onBlur(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		input.value = String(clamp(Number(input.value)));
	}
</script>

<div>
	<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
		{label}
	</p>
	<div class="mt-1.5 flex items-center gap-1.5">
		<button
			type="button"
			aria-label="Darabszám csökkentése"
			disabled={disabled || (value ?? min) <= min}
			onclick={() => shift(-1)}
			class="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700 transition hover:bg-stone-200 active:scale-95 disabled:opacity-40 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/15"
		>
			<Minus size={17} aria-hidden="true" />
		</button>
		<input
			type="number"
			{min}
			{max}
			step="1"
			inputmode="numeric"
			aria-label={label}
			{disabled}
			value={value ?? min}
			oninput={onInput}
			onblur={onBlur}
			class="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-center text-[15px] font-extrabold text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white"
		/>
		<button
			type="button"
			aria-label="Darabszám növelése"
			disabled={disabled || (value ?? min) >= max}
			onclick={() => shift(1)}
			class="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700 transition hover:bg-stone-200 active:scale-95 disabled:opacity-40 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/15"
		>
			<Plus size={17} aria-hidden="true" />
		</button>
	</div>
</div>
