<script lang="ts">
	import { browser } from '$app/environment';
	import { ArrowLeft, Bell, Info, Volume2 } from '@lucide/svelte';
	import Toggle from '$lib/components/Toggle.svelte';

	function loadSettings() {
		const defaults = { reminder: true, streakWarn: true, sounds: false };
		if (!browser) return defaults;
		try {
			const raw = localStorage.getItem('leardy-settings');
			if (raw) return { ...defaults, ...JSON.parse(raw) };
		} catch {
			// sérült mentés: maradnak az alapértékek
		}
		return defaults;
	}

	let settings = $state(loadSettings());

	$effect(() => {
		if (browser) localStorage.setItem('leardy-settings', JSON.stringify(settings));
	});
</script>

<svelte:head>
	<title>Beállítások — Leardy</title>
</svelte:head>

<a href="/" class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-ink-900">
	<ArrowLeft size={16} /> Főoldal
</a>

<h1 class="mt-3 text-[22px] font-extrabold tracking-tight text-ink-900">Beállítások</h1>

<!-- Profil -->
<section class="mt-3 flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
	<span class="grid size-12 shrink-0 place-items-center rounded-full bg-brand-500 text-lg font-extrabold text-white">
		D
	</span>
	<div class="min-w-0">
		<p class="truncate text-[16px] font-bold text-ink-900">Dezső</p>
		<p class="text-[13px] text-ink-400">7 napos sorozat · 1 240 XP</p>
	</div>
</section>

<!-- Értesítések -->
<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5">
	<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900">
		<Bell size={18} class="text-ink-400" /> Értesítések
	</h2>
	<ul class="mt-2 divide-y divide-slate-100">
		<li class="flex items-center gap-3 py-3">
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-semibold text-ink-900">Napi emlékeztető</p>
				<p class="text-[13px] text-ink-400">Minden este 20:00-kor</p>
			</div>
			<Toggle bind:checked={settings.reminder} label="Napi emlékeztető" />
		</li>
		<li class="flex items-center gap-3 py-3">
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-semibold text-ink-900">Sorozat-figyelmeztetés</p>
				<p class="text-[13px] text-ink-400">Ha kimaradna a mai gyakorlás</p>
			</div>
			<Toggle bind:checked={settings.streakWarn} label="Sorozat-figyelmeztetés" />
		</li>
	</ul>
</section>

<!-- Alkalmazás -->
<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5">
	<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900">
		<Volume2 size={18} class="text-ink-400" /> Alkalmazás
	</h2>
	<ul class="mt-2 divide-y divide-slate-100">
		<li class="flex items-center gap-3 py-3">
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-semibold text-ink-900">Hanghatások</p>
				<p class="text-[13px] text-ink-400">Visszajelzés gyakorlás közben</p>
			</div>
			<Toggle bind:checked={settings.sounds} label="Hanghatások" />
		</li>
	</ul>
</section>

<!-- Névjegy -->
<section class="mt-3 rounded-2xl border border-slate-200 bg-white p-5">
	<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900">
		<Info size={18} class="text-ink-400" /> Névjegy
	</h2>
	<div class="mt-2 flex items-center justify-between py-2.5">
		<p class="text-[15px] font-semibold text-ink-900">Verzió</p>
		<p class="text-sm text-ink-400">0.1.0</p>
	</div>
	<p class="rounded-xl bg-paper p-3.5 text-[13px] leading-relaxed text-ink-600">
		A Leardy PWA-ként telepíthető: a böngésző megosztás menüjében válaszd a „Hozzáadás a
		kezdőképernyőhöz" lehetőséget.
	</p>
</section>
