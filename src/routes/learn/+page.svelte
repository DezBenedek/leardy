<script lang="ts">
	import { Check, Compass, Lock, Play, Star } from 'lucide-svelte';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { lessonMeta, store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { cn } from '$lib/utils.js';

	const lang = $derived(store.data.profile.lang);
	const metas = lessonMeta();
	const doneCount = $derived(metas.filter((m) => (store.data.lessons[m.id]?.stars ?? 0) > 0).length);

	function stateOf(i: number) {
		return store.lessonState(i);
	}

	/** Kanyargó útvonal: szinuszos vízszintes eltérés. */
	function offsetX(i: number): number {
		return Math.round(Math.sin(i * 1.15) * 52);
	}
</script>

<svelte:head>
	<title>{t('learn.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<div>
		<h1 class="font-display text-2xl font-extrabold tracking-tight">{t('learn.title')}</h1>
		<p class="text-muted-foreground mt-1 text-sm">{t('learn.sub')}</p>
	</div>

	<!-- Kurzus kártya -->
	<Card class="hero border-0 py-5 text-white">
		<CardContent class="flex items-center gap-4">
			<span class="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-3xl backdrop-blur-sm">🇬🇧</span>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h2 class="font-display text-lg font-extrabold">{lang === 'en' ? 'English A1' : 'Angol A1'}</h2>
					<Badge class="border-white/30 bg-white/20 text-white">Demo</Badge>
				</div>
				<p class="mt-0.5 text-[13px] font-medium text-white/80">
					{doneCount}{t('common.of')}{metas.length} {t('learn.doneLessons')}
				</p>
				<Progress value={doneCount} max={metas.length} class="mt-2 bg-white/25 [&>div]:bg-white" />
			</div>
		</CardContent>
	</Card>

	<!-- Útvonal -->
	<div class="relative flex flex-col items-center gap-1 py-4" role="list" aria-label="Leckék">
		<!-- szaggatott gerinc -->
		<div class="absolute top-6 bottom-6 w-1 rounded-full bg-[repeating-linear-gradient(to_bottom,var(--color-border)_0_8px,transparent_8px_16px)]" aria-hidden="true"></div>

		{#each metas as meta, i (meta.id)}
			{@const st = stateOf(i)}
			{@const stars = store.data.lessons[meta.id]?.stars ?? 0}
			<div role="listitem" class="relative flex w-full flex-col items-center" style="transform: translateX({offsetX(i)}px)">
				{#if st === 'open'}
					<a
						href="/learn/{meta.id}"
						class="press group relative grid size-[76px] place-items-center rounded-full text-white anim-pulse-ring"
						style="background: linear-gradient(to bottom, var(--primary), color-mix(in srgb, var(--primary) 70%, black))"
						aria-label="{t('learn.start')}: {meta.hu}"
					>
						<Play class="size-8 translate-x-0.5" fill="currentColor" />
						<span class="bg-card text-primary border-primary/30 absolute -top-2 left-1/2 -translate-x-1/2 rounded-lg border px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap shadow-md">
							{t('learn.start').toUpperCase()}
						</span>
					</a>
				{:else if st === 'done'}
					<a
						href="/learn/{meta.id}"
						class="press grid size-[68px] place-items-center rounded-full text-white"
						style="background: linear-gradient(to bottom, var(--forest), color-mix(in srgb, var(--forest) 70%, black))"
						aria-label="{meta.hu}"
					>
						<Check class="size-7" strokeWidth={3} />
					</a>
				{:else}
					<div
						class="bg-muted text-muted-foreground grid size-[68px] place-items-center rounded-full"
						title={t('learn.locked')}
						aria-label={t('learn.locked')}
					>
						<Lock class="size-6" />
					</div>
				{/if}
				<div class="mt-1.5 mb-4 flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-center">
					<p class={cn('text-sm leading-tight font-bold', st === 'locked' && 'text-muted-foreground')}>
						{i + 1}. {lang === 'en' ? meta.en : meta.hu}
					</p>
					{#if stars > 0}
						<span class="flex gap-0.5" aria-label="{stars}/3">
							{#each [1, 2, 3] as s (s)}
								<Star class={cn('size-3.5', s <= stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
							{/each}
						</span>
					{:else}
						<p class="text-muted-foreground text-xs">{lang === 'en' ? meta.subEn : meta.subHu}</p>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<Card>
		<CardContent class="flex flex-col items-center gap-2 py-8 text-center">
			<span class="bg-muted grid size-12 place-items-center rounded-2xl">
				<Compass class="text-muted-foreground size-6" />
			</span>
			<p class="font-semibold">{t('learn.more.t')}</p>
			<p class="text-muted-foreground max-w-xs text-sm">{t('learn.more.d')}</p>
		</CardContent>
	</Card>
</div>
