<script lang="ts">
	import type { GameProps } from './types';

	let { q, onAnswer }: GameProps = $props();
	let text = $state('');
</script>

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
		class="shrink-0 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
	>
		Tovább
	</button>
</form>
