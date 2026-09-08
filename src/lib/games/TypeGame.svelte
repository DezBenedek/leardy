<script lang="ts">
	import type { GameProps } from './types';

	let { q, onAnswer, picked = null, correct = null }: GameProps = $props();
	let text = $state('');

	let submitted = $derived(picked !== null && picked !== undefined);
	let ok = $derived(submitted && correct !== null && correct !== undefined && picked === correct);
</script>

{#if submitted}
	<div
		class={[
			'rounded-xl border-2 px-3.5 py-3 text-[15px] font-semibold',
			correct !== null && correct !== undefined
				? ok
					? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200'
					: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-200'
				: 'border-stone-200 text-ink-900 dark:border-white/10 dark:text-white'
		]}
	>
		{picked === '' ? '—' : picked}
	</div>
{:else}
	<form
		onsubmit={(e) => {
			e.preventDefault();
			onAnswer(text.trim());
		}}
		class="flex gap-2"
	>
		<input
			bind:value={text}
			placeholder="Írd be a választ…"
			autocomplete="off"
			aria-label="Válasz"
			class="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
		/>
		<button
			type="submit"
			class="shrink-0 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-95"
		>
			Tovább
		</button>
	</form>
{/if}
