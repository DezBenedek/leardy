<script lang="ts">
	const modules = [
		{
			href: '/learn',
			emoji: '🧭',
			title: 'Tanulás leckéről leckére',
			desc: 'Végigvisz egy teljes nyelven, lépésről lépésre.'
		},
		{
			href: '/decks',
			emoji: '🗂️',
			title: 'Szókártyák',
			desc: 'Paklik és kártyák képekkel, saját szavakkal.'
		},
		{
			href: '/classroom',
			emoji: '🏫',
			title: 'Tanterem',
			desc: 'Nyelvi csoportok, csomagmegosztás és élő doga.'
		}
	];
</script>

<svelte:head>
	<title>Leardy — nyelvtanulás játékosan</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div
		class="rounded-3xl border-2 border-black/10 bg-leardy-500 p-6 text-white shadow-hard dark:border-black"
	>
		<p class="text-sm font-bold uppercase tracking-widest text-white/80">Szia! 👋</p>
		<h1 class="font-display mt-1 text-3xl font-black leading-tight">
			Folytasd, ahol abbahagytad
		</h1>
		<p class="mt-2 font-semibold text-white/90">
			Napi cél: 10 kártya · Sorozat: 0 nap · Ma: 0/10
		</p>
		<a
			href="/practice"
			class="mt-4 inline-block rounded-2xl bg-white px-6 py-3 font-black text-leardy-700 shadow-hard-sm transition-transform active:translate-y-0.5"
		>
			Gyakorlás indítása ⚡
		</a>
	</div>

	<div class="grid gap-3 sm:grid-cols-3">
		{#each modules as m}
			<a
				href={m.href}
				class="rounded-3xl border-2 border-black/10 bg-white p-5 shadow-hard-sm transition-transform active:translate-y-0.5 dark:border-white/10 dark:bg-white/5"
			>
				<div class="text-3xl" aria-hidden="true">{m.emoji}</div>
				<h2 class="font-display mt-2 text-lg font-black">{m.title}</h2>
				<p class="mt-1 text-sm font-medium text-black/60 dark:text-white/60">{m.desc}</p>
			</a>
		{/each}
	</div>
</section>
