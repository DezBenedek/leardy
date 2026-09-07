<script lang="ts">
	import { Layers, Plus } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
</script>

<svelte:head>
	<title>Paklik — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Szókártya paklik</h1>
			<p class="text-muted-foreground mt-1 text-sm">Saját szavaid, képekkel, rendszerben.</p>
		</div>
		<Button size="sm"><Plus class="size-4" /> Új pakli</Button>
	</div>

	<Card>
		<CardContent class="flex flex-col items-center gap-2 py-10 text-center">
			<span class="bg-muted grid size-12 place-items-center rounded-2xl">
				<Layers class="text-muted-foreground size-6" />
			</span>
			<p class="font-semibold">Nincs még paklid</p>
			<p class="text-muted-foreground max-w-xs text-sm">
				Hozd létre az első paklidat, és vedd fel bele a tanulni kívánt szavakat.
			</p>
		</CardContent>
	</Card>
</div>
