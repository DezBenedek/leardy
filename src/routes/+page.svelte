<script lang="ts">
	import { ChevronRight, Compass, Flame, Layers, Play, School, Star, Zap } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';

	const modules = [
		{
			href: '/learn',
			icon: Compass,
			tint: 'bg-primary/10 text-primary',
			title: 'Tanulás leckéről leckére',
			desc: 'Végigvisz egy teljes nyelven, lépésről lépésre.'
		},
		{
			href: '/decks',
			icon: Layers,
			tint: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
			title: 'Szókártyák',
			desc: 'Paklik és kártyák képekkel, saját szavakkal.'
		},
		{
			href: '/classroom',
			icon: School,
			tint: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
			title: 'Tanterem',
			desc: 'Nyelvi csoportok, csomagmegosztás és élő doga.'
		}
	];
</script>

<svelte:head>
	<title>Leardy — nyelvtanulás játékosan</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<Card class="overflow-hidden">
		<CardHeader>
			<div class="flex items-center justify-between">
				<Badge variant="secondary">Napi cél</Badge>
				<div class="flex items-center gap-3 text-sm font-semibold">
					<span class="text-streak inline-flex items-center gap-1">
						<Flame class="size-4" /> 0
					</span>
					<span class="text-xp inline-flex items-center gap-1">
						<Star class="size-4" /> 0 XP
					</span>
				</div>
			</div>
			<CardTitle class="text-2xl">Folytasd, ahol abbahagytad</CardTitle>
			<CardDescription>Ma 0 / 10 kártya van még hátra a napi célodig.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			<Progress value={0} max={10} />
			<div>
				<Button href="/practice" size="lg">
					<Play class="size-4" /> Gyakorlás indítása
				</Button>
			</div>
		</CardContent>
	</Card>

	<div class="grid gap-3 sm:grid-cols-3">
		{#each modules as m}
			{@const Icon = m.icon}
			<a href={m.href} class="group">
				<Card class="h-full transition-colors group-hover:border-primary/40">
					<CardContent class="flex flex-col gap-3 pt-1">
						<span class="grid size-10 place-items-center rounded-xl {m.tint}">
							<Icon class="size-5" />
						</span>
						<div>
							<h2 class="flex items-center gap-1 text-[15px] font-semibold">
								{m.title}
								<ChevronRight class="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
							</h2>
							<p class="text-muted-foreground mt-1 text-sm leading-snug">{m.desc}</p>
						</div>
					</CardContent>
				</Card>
			</a>
		{/each}
	</div>

	<a href="/practice" class="group">
		<Card class="flex-row items-center gap-3 py-4 transition-colors group-hover:border-primary/40">
			<span class="bg-xp/15 text-xp grid size-10 shrink-0 place-items-center rounded-xl">
				<Zap class="size-5" />
			</span>
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-semibold">Villámismétlés</p>
				<p class="text-muted-foreground text-sm">5 perc, a leggyengébb szavaidból.</p>
			</div>
			<ChevronRight class="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
		</Card>
	</a>
</section>
