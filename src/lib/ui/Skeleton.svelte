<script lang="ts">
	/** Apró pulzáló helykitöltő-blokk skeleton-UI-hoz. Méretet `cls`-sel adj meg. */
	let { cls = 'h-4 rounded-lg' }: { cls?: string } = $props();
</script>

<div aria-hidden="true" class="animate-pulse bg-stone-200/70 motion-reduce:animate-none dark:bg-white/10 {cls}"></div>
