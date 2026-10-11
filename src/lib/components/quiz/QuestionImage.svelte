<script lang="ts">
	import { ImageOff } from '@lucide/svelte';
	import { normalizeQuestionImageUrl } from '$lib/question-image';
	let { src }: { src?: string } = $props();
	const url = $derived(normalizeQuestionImageUrl(src) || '');
	let failed = $state('');
</script>

{#if url}
	<div class="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 dark:border-white/10 dark:bg-white/5">
		<img src={url} alt="A kérdéshez tartozó kép" referrerpolicy="no-referrer" decoding="async"
			onerror={() => (failed = url)} onload={() => (failed = '')} hidden={failed === url}
			class="max-h-72 w-full object-contain" />
		{#if failed === url}<p role="status" class="flex items-center justify-center gap-2 px-3 py-5 text-xs text-stone-500 dark:text-stone-400"><ImageOff size={17} aria-hidden="true" /> A kép nem tölthető be.</p>{/if}
	</div>
{/if}
