<svelte:head>
	<title>Beállítások — Leardy</title>
</svelte:head>

<h1 class="font-display text-2xl font-black">Profil és beállítások</h1>
<p class="mt-1 font-medium text-black/60 dark:text-white/60">
	Nyelv, téma, fiók és offline tárhely — hamarosan. ⚙️
</p>
<button
	type="button"
	onclick={() => {
		const dark = document.documentElement.classList.toggle('dark');
		try {
			localStorage.setItem('leardy-theme', dark ? 'dark' : 'light');
		} catch {
			/* private mode */
		}
	}}
	class="mt-6 rounded-2xl border-2 border-black/10 bg-white px-6 py-3 font-black shadow-hard-sm transition-transform active:translate-y-0.5 dark:border-white/10 dark:bg-white/5"
>
	Téma váltása 🌗
</button>
