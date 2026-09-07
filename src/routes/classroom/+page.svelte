<script lang="ts">
	import { School, UserPlus } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
</script>

<svelte:head>
	<title>Tanterem — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Tanterem</h1>
			<p class="text-muted-foreground mt-1 text-sm">Nyelvi csoportok, megosztott csomagok, élő dogák.</p>
		</div>
		<Button variant="outline" size="sm"><UserPlus class="size-4" /> Csatlakozás</Button>
	</div>

	<Card>
		<CardContent class="flex flex-col items-center gap-2 py-10 text-center">
			<span class="bg-muted grid size-12 place-items-center rounded-2xl">
				<School class="text-muted-foreground size-6" />
			</span>
			<p class="font-semibold">Még nem vagy csoportban</p>
			<p class="text-muted-foreground max-w-xs text-sm">
				Kérd el a tanárodtól a csoportkódot, és csatlakozz a nyelvi csoportodhoz.
			</p>
		</CardContent>
	</Card>
</div>
