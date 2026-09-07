<script lang="ts">
	import { Compass } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
</script>

<svelte:head>
	<title>Tanulás — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Tanulás leckéről leckére</h1>
		<p class="text-muted-foreground mt-1 text-sm">Válassz nyelvet, és végigmegyünk rajta együtt.</p>
	</div>

	<Card class="flex-row items-center gap-4 py-4">
		<span class="bg-primary/10 grid size-12 shrink-0 place-items-center rounded-2xl text-2xl">🇬🇧</span>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<p class="font-semibold">Angol A1</p>
				<Badge variant="secondary">Demó</Badge>
			</div>
			<p class="text-muted-foreground text-sm">0 / 5 lecke kész</p>
			<Progress value={0} max={5} class="mt-2" />
		</div>
	</Card>

	<Card>
		<CardContent class="flex flex-col items-center gap-2 py-10 text-center">
			<span class="bg-muted grid size-12 place-items-center rounded-2xl">
				<Compass class="text-muted-foreground size-6" />
			</span>
			<p class="font-semibold">További nyelvek hamarosan</p>
			<p class="text-muted-foreground max-w-xs text-sm">
				Német, spanyol és olasz kurzusok készülnek. Az angol demó 5 leckével indul.
			</p>
		</CardContent>
	</Card>
</div>
