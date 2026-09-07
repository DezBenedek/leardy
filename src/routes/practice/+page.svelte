<script lang="ts">
	import { PartyPopper, Zap } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
</script>

<svelte:head>
	<title>Gyakorlás — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Napi gyakorlás</h1>
		<p class="text-muted-foreground mt-1 text-sm">Az esedékes kártyáid ismétlése, okos sorrendben.</p>
	</div>

	<Card>
		<CardContent class="flex flex-col items-center gap-2 py-10 text-center">
			<span class="bg-primary/10 grid size-12 place-items-center rounded-2xl">
				<PartyPopper class="text-primary size-6" />
			</span>
			<p class="font-semibold">Ma nincs esedékes kártyád</p>
			<p class="text-muted-foreground max-w-xs text-sm">
				Minden naprakész. Ha szeretnél, indíthatsz egy extra villámismétlést.
			</p>
			<Button variant="outline" class="mt-2"><Zap class="size-4" /> Villámismétlés</Button>
		</CardContent>
	</Card>
</div>
