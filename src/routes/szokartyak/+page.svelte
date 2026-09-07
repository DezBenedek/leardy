<script lang="ts">
	import { ArrowLeft, Layers, Play, Plus, RotateCw } from '@lucide/svelte';

	let flipped = $state(false);
	let index = $state(0);

	const decks = [
		{ name: 'Alapszavak', sub: '32 kártya · 8 ismétlésre vár', due: 8 },
		{ name: 'Utazás', sub: '24 kártya · 5 ismétlésre vár', due: 5 },
		{ name: 'Üzleti angol', sub: '30 kártya · minden kész', due: 0 }
	];

	const cards = [
		{ front: 'to achieve', back: 'elérni, megvalósítani' },
		{ front: 'journey', back: 'utazás, út' },
		{ front: 'to improve', back: 'fejleszteni, javítani' }
	];

	function next() {
		index = (index + 1) % cards.length;
		flipped = false;
	}
</script>

<svelte:head>
	<title>Szókártyák — Leardy</title>
</svelte:head>

<a href="/" class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-ink-900">
	<ArrowLeft size={16} /> Főoldal
</a>

<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3.5">
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
				<Layers size={22} />
			</span>
			<div>
				<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900">Szókártyák</h1>
				<p class="text-sm text-ink-600">Ma 13 kártya vár ismétlésre.</p>
			</div>
		</div>
		<button class="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
			<Play size={15} strokeWidth={2.5} /> Ismétlés
		</button>
	</div>
</section>

<!-- Gyakorlás -->
<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
	<p class="text-xs font-semibold text-ink-400">{index + 1} / {cards.length}</p>
	<button
		onclick={() => (flipped = !flipped)}
		class="relative mt-3 aspect-[8/5] w-full [perspective:1200px]"
		aria-label="Kártya megfordítása"
	>
		<div
			class="absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d]"
			style="transform: rotateY({flipped ? 180 : 0}deg)"
		>
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-paper [backface-visibility:hidden]">
				<p class="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">{cards[index].front}</p>
				<p class="mt-1 inline-flex items-center gap-1 text-xs font-medium text-ink-400">
					<RotateCw size={13} /> Kattints a jelentésért
				</p>
			</div>
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-ink-900 [backface-visibility:hidden] [transform:rotateY(180deg)]">
				<p class="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{cards[index].back}</p>
				<p class="mt-1 text-xs font-medium text-white/60">Tudtad?</p>
			</div>
		</div>
	</button>
	<div class="mt-4 grid grid-cols-2 gap-2.5">
		<button
			onclick={next}
			class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-slate-50"
		>
			Még gyakorlom
		</button>
		<button
			onclick={next}
			class="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
		>
			Tudtam
		</button>
	</div>
</section>

<!-- Paklik -->
<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
	<h2 class="text-[16px] font-bold text-ink-900">Paklijaim</h2>
	<ul class="mt-3 space-y-2.5">
		{#each decks as d (d.name)}
			<li class="flex items-center gap-3.5 rounded-xl border border-slate-100 p-3.5">
				<span class="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-ink-600">
					<Layers size={19} />
				</span>
				<div class="min-w-0 flex-1">
					<p class="truncate text-[15px] font-semibold text-ink-900">{d.name}</p>
					<p class="text-[13px] text-ink-400">{d.sub}</p>
				</div>
				{#if d.due > 0}
					<span class="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600">{d.due}</span>
				{:else}
					<span class="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">Kész</span>
				{/if}
			</li>
		{/each}
	</ul>
	<button class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold text-ink-400 transition hover:border-brand-500 hover:text-brand-600">
		<Plus size={16} /> Új pakli
	</button>
</section>
