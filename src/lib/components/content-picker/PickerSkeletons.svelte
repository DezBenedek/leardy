<script lang="ts">
	import Skeleton from '$lib/ui/Skeleton.svelte';

	let { count = 3 }: { count?: number } = $props();
</script>

{#each Array.from({ length: count }, (_, index) => index) as row (row)}
	<li>
		{#if row === 0}<span class="sr-only" role="status">Tananyag betöltése…</span>{/if}
		<div aria-hidden="true" class="flex items-center gap-2.5 rounded-2xl p-2.5">
			<Skeleton cls="size-9 shrink-0 rounded-xl" />
			<div class="min-w-0 flex-1 space-y-2">
				<Skeleton cls={row % 2 === 0 ? 'h-4 w-2/3 rounded-md' : 'h-4 w-1/2 rounded-md'} />
				<Skeleton cls="h-3 w-1/3 rounded-md" />
			</div>
		</div>
	</li>
{/each}
