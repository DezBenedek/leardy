<script lang="ts">
	import { X } from '@lucide/svelte';
	let { label, disabled, onclick }: { label: string; disabled: boolean; onclick: () => void } = $props();
</script>

<button type="button" aria-label={label} title={label} {disabled} {onclick} class="row-button text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"><X size={15} aria-hidden="true" /></button>
