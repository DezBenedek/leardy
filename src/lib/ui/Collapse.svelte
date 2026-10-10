<script lang="ts">
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { motionOK } from '$lib/overlay';
	let { open, id, children }: { open: boolean; id?: string; children: Snippet } = $props();
</script>

<div {id} inert={!open} aria-hidden={!open}>
	{#if open}
		<div transition:slide={{ duration: motionOK() ? 280 : 0, easing: cubicOut }}>
			{@render children()}
		</div>
	{/if}
</div>
