<script lang="ts">
	import { CircleCheck, CircleX } from 'lucide-svelte';

	/** Színes visszajelző sáv gyakorláshoz (régi FeedbackPill). */
	interface Props {
		correct: boolean;
		text: string;
	}

	let { correct, text }: Props = $props();
</script>

<div
	class="inline-flex min-w-0 items-center gap-2 rounded-[14px] border-[1.5px] px-3.5 py-2.5"
	style="color: {correct ? 'var(--forest)' : 'var(--wine)'}; background: color-mix(in srgb, {correct
		? 'var(--forest)'
		: 'var(--wine)'} 12%, transparent); border-color: color-mix(in srgb, {correct
		? 'var(--forest)'
		: 'var(--wine)'} 45%, transparent)"
>
	{#if correct}
		<CircleCheck class="size-[22px] shrink-0" />
	{:else}
		<CircleX class="size-[22px] shrink-0" />
	{/if}
	<span class="text-center text-[16px] font-bold">{text}</span>
</div>
