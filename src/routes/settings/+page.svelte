<script lang="ts">
	import { Bell, Globe, Moon, Sun, User } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';

	let dark = $state(false);

	$effect(() => {
		dark = document.documentElement.classList.contains('dark');
	});

	function toggleTheme() {
		dark = document.documentElement.classList.toggle('dark');
		try {
			localStorage.setItem('leardy-theme', dark ? 'dark' : 'light');
		} catch {
			/* privát mód */
		}
	}

	const rows = [
		{ icon: User, title: 'Fiók', desc: 'Név, e-mail, jelszó', action: 'Hamarosan' },
		{ icon: Globe, title: 'Nyelv', desc: 'Az app nyelve: magyar', action: 'Hamarosan' },
		{ icon: Bell, title: 'Emlékeztetők', desc: 'Napi gyakorlás értesítés', action: 'Hamarosan' }
	];
</script>

<svelte:head>
	<title>Beállítások — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Profil és beállítások</h1>
		<p class="text-muted-foreground mt-1 text-sm">Fiók, nyelv, téma és értesítések.</p>
	</div>

	<Card class="flex-row items-center gap-4 py-4">
		<span class="bg-muted grid size-12 shrink-0 place-items-center rounded-full">
			<User class="text-muted-foreground size-6" />
		</span>
		<div class="min-w-0 flex-1">
			<p class="font-semibold">Vendég tanuló</p>
			<p class="text-muted-foreground text-sm">Jelentkezz be, hogy szinkronizáljuk a haladásod.</p>
		</div>
		<Button size="sm">Belépés</Button>
	</Card>

	<Card class="py-2">
		<CardContent class="flex flex-col px-2">
			<button
				type="button"
				onclick={toggleTheme}
				class="hover:bg-accent flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
			>
				<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
					{#if dark}<Sun class="size-[18px]" />{:else}<Moon class="size-[18px]" />{/if}
				</span>
				<span class="flex-1">
					<span class="block text-sm font-semibold">Megjelenés</span>
					<span class="text-muted-foreground block text-xs">{dark ? 'Sötét mód' : 'Világos mód'}</span>
				</span>
			</button>

			{#each rows as r}
				{@const Icon = r.icon}
				<div class="flex items-center gap-3 rounded-xl px-3 py-3 opacity-70">
					<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
						<Icon class="size-[18px]" />
					</span>
					<span class="flex-1">
						<span class="block text-sm font-semibold">{r.title}</span>
						<span class="text-muted-foreground block text-xs">{r.desc}</span>
					</span>
					<span class="text-muted-foreground text-xs font-medium">{r.action}</span>
				</div>
			{/each}
		</CardContent>
	</Card>
</div>
