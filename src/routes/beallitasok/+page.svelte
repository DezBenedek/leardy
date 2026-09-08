<script lang="ts">
	import { browser } from '$app/environment';
	import {
		Bell,
		Check,
		ChevronRight,
		Info,
		Layers,
		LogOut,
		Moon,
		Palette,
		Smartphone,
		Sun,
		Terminal,
		UserRound
	} from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { studyApi } from '$lib/study';
	import { APP_VERSION, appBuildLabel } from '$lib/version';
	import { theme, type ThemeChoice } from '$lib/theme.svelte';

	type Sheet = null | 'account' | 'notif' | 'theme' | 'cards' | 'dev' | 'about';

	let user = $derived(auth.user);

	async function applyTeacherMode(want: string) {
		try {
			await studyApi.setRole(want);
			await auth.refresh();
		} catch {
			// hiba (pl. offline sorba állt): visszaállunk a fiók szerinti értékre
			teacherMode = (auth.user?.role ?? 'student') === 'teacher';
		}
	}

	let teacherMode = $state(false);
	let teacherInit = $state(false);

	$effect(() => {
		// A kapcsoló követi a fiókot (betöltés, másik eszköz, visszakapcsolódás).
		teacherMode = (user?.role ?? 'student') === 'teacher';
		teacherInit = true;
	});

	$effect(() => {
		if (!teacherInit || !auth.user) return;
		const want = teacherMode ? 'teacher' : 'student';
		if (auth.user.role !== want) void applyTeacherMode(want);
	});
	let initial = $derived(user?.name.trim().charAt(0).toUpperCase() ?? '');
	let sheet = $state<Sheet>(null);

	const sheetTitles: Record<Exclude<Sheet, null>, string> = {
		account: 'Fiók',
		notif: 'Értesítések',
		theme: 'Megjelenés',
		cards: 'Szókártyák',
		dev: 'Fejlesztői beállítások',
		about: 'Névjegy'
	};

	function loadSettings() {
		const defaults = { reminder: true, streakWarn: true, sounds: false, autoAudio: false };
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

	let notifOn = $derived(
		[settings.reminder, settings.streakWarn, settings.sounds].filter(Boolean).length
	);
	let notifSummary = $derived(
		notifOn === 3 ? 'Mind bekapcsolva' : notifOn === 0 ? 'Kikapcsolva' : `${notifOn}/3 bekapcsolva`
	);
	let cardsSummary = $derived(settings.autoAudio ? 'Automatikus felolvasás be' : 'Csak gombnyomásra olvas fel');
	let devSummary = $derived((user?.role ?? 'student') === 'teacher' ? 'Tanár mód bekapcsolva' : 'Tanár mód kikapcsolva');
	let themeLabel = $derived(
		theme.choice === 'light' ? 'Világos' : theme.choice === 'dark' ? 'Sötét' : 'Rendszer'
	);

	const themeOptions: { id: ThemeChoice; label: string; desc: string; icon: typeof Sun }[] = [
		{ id: 'light', label: 'Világos', desc: 'Mindig világos felület', icon: Sun },
		{ id: 'dark', label: 'Sötét', desc: 'Kíméli a szemed este', icon: Moon },
		{ id: 'system', label: 'Rendszer', desc: 'Követi az eszköz beállítását', icon: Smartphone }
	];

	const tile =
		'grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white';
</script>

<svelte:head>
	<title>Beállítások — Leardy</title>
</svelte:head>

<h1 class="mt-3 text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Beállítások</h1>

<!-- Fiók -->
<button
	onclick={() => (sheet = 'account')}
	class="mt-3 flex w-full items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
>
	{#if user}
		<span class="grid size-11 shrink-0 place-items-center rounded-full bg-brand-500 text-[17px] font-extrabold text-white">
			{initial}
		</span>
		<span class="min-w-0 flex-1">
			<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{user.name}</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{user.email}</span>
		</span>
	{:else}
		<span class={tile}>
			<UserRound size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Fiók</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Jelentkezz be a tanteremhez</span>
		</span>
	{/if}
	<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
</button>

<!-- Opciók -->
<div class="mt-3 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-stone-900">
	<button
		onclick={() => (sheet = 'notif')}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Bell size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Értesítések</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{notifSummary}</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	<button
		onclick={() => (sheet = 'theme')}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Palette size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Megjelenés</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{themeLabel}</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	<button
		onclick={() => (sheet = 'cards')}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Layers size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Szókártyák</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{cardsSummary}</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	<button
		onclick={() => (sheet = 'dev')}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Terminal size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Fejlesztői beállítások</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{devSummary}</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	<button
		onclick={() => (sheet = 'about')}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Info size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Névjegy</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{APP_VERSION} verzió</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
</div>

<!-- Drawer a kiválasztott opcióval -->
<Drawer open={sheet !== null} label={sheet ? sheetTitles[sheet] : ''} onClose={() => (sheet = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">
			{sheet ? sheetTitles[sheet] : ''}
		</h2>

		{#if sheet === 'account'}
			<div class="mt-4">
				{#if user}
					<div class="flex items-center gap-3.5">
						<span class="grid size-12 shrink-0 place-items-center rounded-full bg-brand-500 text-lg font-extrabold text-white">
							{initial}
						</span>
						<div class="min-w-0">
							<p class="truncate text-[16px] font-bold text-ink-900 dark:text-white">{user.name}</p>
							<p class="truncate text-[13px] text-ink-400 dark:text-stone-500">{user.email}</p>
						</div>
					</div>
					<button
						onclick={() => {
							auth.logout();
							sheet = null;
						}}
						class="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
					>
						<LogOut size={17} />
						Kijelentkezés
					</button>
				{:else}
					<p class="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
						A tanterem és a haladásod mentése fiókhoz kötött.
					</p>
					<button
						onclick={() => {
							sheet = null;
							authUI.show('login');
						}}
						class="mt-4 w-full rounded-full bg-brand-500 px-4 py-2.5 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
					>
						Bejelentkezés
					</button>
					<button
						onclick={() => {
							sheet = null;
							authUI.show('register');
						}}
						class="mt-2 w-full rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[15px] font-bold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
					>
						Regisztráció
					</button>
				{/if}
			</div>
		{:else if sheet === 'notif'}
			<ul class="mt-2 divide-y divide-stone-100 dark:divide-white/5">
				<li class="flex items-center gap-3 py-3.5">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Napi emlékeztető</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">Minden este 20:00-kor</p>
					</div>
					<Toggle bind:checked={settings.reminder} label="Napi emlékeztető" />
				</li>
				<li class="flex items-center gap-3 py-3.5">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Sorozat-figyelmeztetés</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">Ha kimaradna a mai gyakorlás</p>
					</div>
					<Toggle bind:checked={settings.streakWarn} label="Sorozat-figyelmeztetés" />
				</li>
				<li class="flex items-center gap-3 py-3.5">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Hanghatások</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">Visszajelzés gyakorlás közben</p>
					</div>
					<Toggle bind:checked={settings.sounds} label="Hanghatások" />
				</li>
			</ul>
		{:else if sheet === 'theme'}
			<ul class="mt-4 space-y-2.5">
				{#each themeOptions as opt (opt.id)}
					{@const Icon = opt.icon}
					{@const selected = theme.choice === opt.id}
					<li>
						<button
							onclick={() => theme.set(opt.id)}
							aria-pressed={selected}
							class={[
								'flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition active:scale-[0.99]',
								selected
									? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/15'
									: 'border-stone-200 bg-white hover:bg-stone-50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5'
							]}
						>
							<span class={tile}>
								<Icon size={22} />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block text-[15px] font-bold text-ink-900 dark:text-white">{opt.label}</span>
								<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{opt.desc}</span>
							</span>
							<span
								class={[
									'grid size-6 shrink-0 place-items-center rounded-full transition',
									selected ? 'bg-brand-500 text-white' : 'border-2 border-stone-200 dark:border-white/15'
								]}
							>
								{#if selected}
									<Check size={14} strokeWidth={3.2} />
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if sheet === 'cards'}
			<ul class="mt-2 divide-y divide-stone-100 dark:divide-white/5">
				<li class="flex items-center gap-3 py-3.5">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Automatikus felolvasás</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">Forgatás után felolvassa az idegen szót</p>
					</div>
					<Toggle bind:checked={settings.autoAudio} label="Automatikus felolvasás" />
				</li>
			</ul>
		{:else if sheet === 'dev'}
			{#if user}
				<ul class="mt-2 divide-y divide-stone-100 dark:divide-white/5">
					<li class="flex items-center gap-3 py-3.5">
						<div class="min-w-0 flex-1">
							<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Tanár mód</p>
							<p class="text-[13px] text-ink-400 dark:text-stone-500">Osztályok létrehozása, dolgozatok kiadása</p>
						</div>
						<Toggle bind:checked={teacherMode} label="Tanár mód" />
					</li>
				</ul>
			{:else}
				<p class="mt-4 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
					A fejlesztői beállítások fiókhoz kötöttek.
				</p>
				<button
					onclick={() => {
						sheet = null;
						authUI.show('login');
					}}
					class="mt-4 w-full rounded-full bg-brand-500 px-4 py-2.5 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
				>
					Bejelentkezés
				</button>
			{/if}
		{:else if sheet === 'about'}
			<div class="mt-4">
				<div class="flex items-center justify-between py-2.5">
					<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Verzió</p>
					<p class="text-sm text-ink-400 tabular-nums dark:text-stone-500">{APP_VERSION}</p>
				</div>
				<div class="flex items-center justify-between py-2.5">
					<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Utolsó frissítés</p>
					<p class="text-sm text-ink-400 tabular-nums dark:text-stone-500">{appBuildLabel()}</p>
				</div>
				<p class="rounded-xl bg-stone-100 p-3.5 text-[13px] leading-relaxed text-ink-600 dark:bg-white/5 dark:text-stone-400">
					A Ferences Ösztöndíj Programra készült a 2026/27-es tanévben.
				</p>
				<div class="mt-2.5 rounded-xl bg-stone-100 p-3.5 dark:bg-white/5">
					<p class="text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Fejlesztők</p>
					<p class="mt-1.5 text-[15px] font-semibold text-ink-900 dark:text-white">
						<a
							href="https://dezso.hu"
							target="_blank"
							rel="noopener noreferrer"
							class="text-brand-600 underline decoration-brand-300 underline-offset-2 dark:text-brand-400"
						>
							Dezső Benedek Péter
						</a>
						<span class="font-normal text-ink-600 dark:text-stone-400"> és Fidrich Bercel</span>
					</p>
				</div>
				<p class="mt-2.5 rounded-xl bg-stone-100 p-3.5 text-[13px] leading-relaxed text-ink-600 dark:bg-white/5 dark:text-stone-400">
					A Leardy PWA-ként telepíthető: a böngésző megosztás menüjében válaszd a „Hozzáadás a
					kezdőképernyőhöz" lehetőséget.
				</p>
			</div>
		{/if}
	</div>
</Drawer>
