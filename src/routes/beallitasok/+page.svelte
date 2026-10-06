<script lang="ts">
	import {
		Bell,
		BellOff,
		BellRing,
		ChevronRight,
		Database,
		HardDrive,
		Info,
		Layers,
		LogOut,
		MessageCircle,
		Moon,
		Palette,
		Pencil,
		Send,
		Smartphone,
		Sparkles,
		Sun,
		Trash2,
		UserRound
	} from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import FontFamilyPicker from '$lib/components/FontFamilyPicker.svelte';
	import GoogleLoginButton from '$lib/components/GoogleLoginButton.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import WhatsNew from '$lib/components/WhatsNew.svelte';
	import { auth } from '$lib/auth.svelte';
	import { loadSettings, saveSettings } from '$lib/settings';
	import { applyDisplaySettings } from '$lib/display';
	import {
		canNotify,
		getNotifPermission,
		requestNotifPermission,
		type NotifPermission
	} from '$lib/notifications';
	import { toast } from '$lib/toast.svelte';
	import { pushState, subscribePush, unsubscribePush, type PushState } from '$lib/push-client';
	import { LATEST_CHANGE } from '$lib/changelog';
	import { APP_VERSION, appBuildLabel } from '$lib/version';
	import { theme, type ThemeChoice } from '$lib/theme.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Sheet = null | 'account' | 'notif' | 'theme' | 'cards' | 'storage' | 'about';
	type AccountEdit = null | 'name';

	// Szerveradat a forras az elso paintkor, igy nincs profil-villanas.
	let user = $derived(auth.ready ? auth.user : (data.user ?? null));
	let initial = $derived(user?.name.trim().charAt(0).toUpperCase() ?? '');
	let sheet = $state<Sheet>(null);
	let accountEdit = $state<AccountEdit>(null);
	let whatsNewOpen = $state(false);

	let nameDraft = $state('');
	let busyName = $state(false);

	$effect(() => {
		if (sheet === 'account' && user) {
			nameDraft = user.name;
		}
	});

	const accountEditTitles: Record<Exclude<AccountEdit, null>, string> = {
		name: 'Név módosítása'
	};

	const inputCls =
		'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:ring-brand-500/20';

	const primaryCls =
		'inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-500 px-5 py-2.5 text-[15px] font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30';

	async function saveName(e: SubmitEvent) {
		e.preventDefault();
		if (busyName) return;
		busyName = true;
		const res = await auth.updateName(nameDraft);
		busyName = false;
		if (res.ok) {
			toast.success('Név frissítve', 'Sikeresen módosítottad a neved.');
			accountEdit = null;
		} else {
			toast.error('Nem sikerült menteni', res.error);
		}
	}

	function closeAccountEdit() {
		accountEdit = null;
	}

	const sheetTitles: Record<Exclude<Sheet, null>, string> = {
		account: 'Fiók',
		notif: 'Értesítések',
		theme: 'Megjelenés',
		cards: 'Gyakorlás',
		storage: 'Tárhely',
		about: 'Névjegy'
	};

	let settings = $state(loadSettings());
	let notifPerm = $state<NotifPermission>('default');
	let pushSt = $state<PushState>('off');
	let pushBusy = $state(false);
	let deleteAccountOpen = $state(false);
	let deleteAccountBusy = $state(false);
	let exportBusy = $state(false);
	let storageInfo = $state({ lib: 0, scope: 0, seen: 0, total: 0 });
	let storageBusy = $state(false);

	function byteSize(v: string | null): number {
		if (!v) return 0;
		try {
			return new Blob([v]).size;
		} catch {
			return v.length;
		}
	}

	function fmtBytes(n: number): string {
		if (!Number.isFinite(n) || n <= 0) return '0 B';
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(2)} MB`;
	}

	function refreshStorageInfo() {
		if (typeof localStorage === 'undefined') return;
		try {
			let seen = 0;
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i) ?? '';
				if (k.startsWith('leardy-seen-') || k.startsWith('leardy-reminder-') || k.startsWith('leardy-notif-')) {
					seen += byteSize(localStorage.getItem(k));
				}
			}
			const lib = byteSize(localStorage.getItem('leardy-library'));
			const scope = byteSize(localStorage.getItem('leardy-scope'));
			storageInfo = { lib, scope, seen, total: lib + scope + seen };
		} catch {
			// tiltott storage
		}
	}

	function unmuteClassroom(id: string) {
		settings.mutedClassrooms = settings.mutedClassrooms.filter((x) => x !== id);
	}

	function unmuteAll() {
		settings.mutedClassrooms = [];
	}

	async function clearOfflineLibrary() {
		if (storageBusy) return;
		storageBusy = true;
		try {
			localStorage.removeItem('leardy-library');
			refreshStorageInfo();
			toast.success('Offline tárhely ürítve', 'Legközelebb hálózatból töltünk.');
		} catch {
			toast.error('Nem sikerült üríteni');
		} finally {
			storageBusy = false;
		}
	}

	async function clearAllCache() {
		if (storageBusy) return;
		storageBusy = true;
		try {
			const keepSettings = localStorage.getItem('leardy-settings');
			const keepTheme = localStorage.getItem('leardy-theme');
			const keepWhats = localStorage.getItem('leardy-whatsnew-seen');
			const keys: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i);
				if (k && k.startsWith('leardy-')) keys.push(k);
			}
			for (const k of keys) {
				if (k === 'leardy-settings' || k === 'leardy-theme' || k === 'leardy-whatsnew-seen') continue;
				localStorage.removeItem(k);
			}
			if (keepSettings !== null) localStorage.setItem('leardy-settings', keepSettings);
			if (keepTheme !== null) localStorage.setItem('leardy-theme', keepTheme);
			if (keepWhats !== null) localStorage.setItem('leardy-whatsnew-seen', keepWhats);
			refreshStorageInfo();
			toast.success('Gyorstár ürítve', 'A beállításaid megmaradtak.');
		} catch {
			toast.error('Nem sikerült üríteni');
		} finally {
			storageBusy = false;
		}
	}

	function refreshNotifPerm() {
		try {
			notifPerm = getNotifPermission();
		} catch {
			notifPerm = 'unsupported';
		}
	}

	let notifBusy = $state(false);
	let testBusy = $state(false);
	let classroomNames = $state<Record<string, string>>({});
	let mutedLoading = $state(false);

	function mutedName(id: string): string {
		return classroomNames[id] ?? 'Névtelen osztály';
	}

	async function loadMutedNames() {
		if (mutedLoading) return;
		if (settings.mutedClassrooms.length === 0) return;
		mutedLoading = true;
		try {
			const res = await fetch('/api/classrooms', { credentials: 'same-origin' });
			if (!res.ok) return;
			const j = (await res.json()) as {
				teaching?: { id: string; name: string }[];
				joined?: { id: string; name: string }[];
			};
			const map: Record<string, string> = {};
			for (const r of [...(j.teaching ?? []), ...(j.joined ?? [])]) {
				if (r?.id) map[r.id] = r.name || 'Névtelen osztály';
			}
			classroomNames = map;
		} catch {
			// név nélkül is feloldható
		} finally {
			mutedLoading = false;
		}
	}

	async function enableNotif() {
		if (notifBusy) return;
		notifBusy = true;
		try {
			notifPerm = await requestNotifPermission();
			if (notifPerm === 'granted') {
				toast.success('Értesítések engedélyezve', 'Most kapcsold be a push-t is, hogy zárt appnál is szóljon.');
				pushState()
					.then((s) => {
						pushSt = s;
						pushKnown = true;
					})
					.catch(() => {});
			} else if (notifPerm === 'denied') {
				toast.error('Le van tiltva', 'A böngésző beállításaiban kapcsold vissza az értesítéseket.');
			}
		} finally {
			notifBusy = false;
		}
	}

	$effect(() => {
		if (sheet === 'notif') {
			refreshNotifPerm();
			pushState()
				.then((s) => {
					pushSt = s;
					pushKnown = true;
				})
				.catch(() => {
					pushSt = 'off';
					pushKnown = true;
				});
			loadMutedNames().catch(() => {});
		}
	});

	async function togglePush() {
		if (pushBusy) return;
		pushBusy = true;
		try {
			if (pushSt === 'on') {
				const res = await unsubscribePush();
				if (res.ok) {
					pushSt = 'off';
					toast.success('Push kikapcsolva ezen az eszközön');
				} else {
					toast.error('Nem sikerült', res.error);
				}
			} else {
				const res = await subscribePush();
				if (res.ok) {
					pushSt = 'on';
					pushKnown = true;
					refreshNotifPerm();
					toast.success('Push bekapcsolva', 'Üzenet, feladat és jegy zárt appnál is megérkezik.');
				} else {
					if (pushSt !== 'denied') pushSt = await pushState().catch(() => pushSt);
					pushKnown = true;
					toast.error('Nem sikerült', res.error);
				}
			}
		} finally {
			pushBusy = false;
		}
	}

	async function sendTestPush() {
		if (testBusy) return;
		testBusy = true;
		try {
			const res = await fetch('/api/push/test', { method: 'POST', credentials: 'same-origin' });
			const j = (await res.json().catch(() => ({}))) as { error?: string };
			if (res.ok) {
				toast.success('Teszt elküldve', 'Zárd be az appot: pár másodpercen belül meg kell érkeznie.');
			} else {
				toast.error('Nem sikerült', j.error ?? 'Próbáld újra!');
			}
		} finally {
			testBusy = false;
		}
	}



	async function exportAccountData() {
		if (exportBusy) return;
		exportBusy = true;
		try {
			const data = await auth.exportData();
			if (!data) {
				toast.error('Nem sikerült letölteni');
				return;
			}
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = 'leardy-adataim.json';
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 5000);
			toast.success('Adatok letöltve');
		} finally {
			exportBusy = false;
		}
	}

	async function deleteAccount() {
		if (deleteAccountBusy) return;
		deleteAccountBusy = true;
		const res = await auth.deleteAccount();
		deleteAccountBusy = false;
		if (res.ok) {
			deleteAccountOpen = false;
			sheet = null;
			toast.success('Fiók törölve', 'Minden adatod törlődött.');
		} else {
			toast.error('Nem sikerült törölni', res.error);
		}
	}

	function onReminderTime(e: Event) {
		const v = (e.target as HTMLInputElement)?.value ?? '';
		if (/^([01]?\d|2[0-3]):([0-5]\d)$/.test(v)) {
			const [h, m] = v.split(':');
			settings.reminderTime = `${h.padStart(2, '0')}:${m}`;
		}
	}

	$effect(() => {
		// Kijelzo azonnal, tarolas debounce-szal: csuszkahuzas kozben
		// nem irunk szinkron localStorage-t minden kepkockanal.
		const snapshot = $state.snapshot(settings);
		applyDisplaySettings(snapshot);
		const t = setTimeout(() => saveSettings(snapshot), 250);
		return () => clearTimeout(t);
	});

	$effect(() => {
		if (sheet === 'storage') refreshStorageInfo();
	});

	let notifOn = $derived(
		[
			settings.reminder,
			settings.pushClassMessage,
			settings.pushClassTask,
			settings.pushGrades,
			settings.pushFeatures,
			settings.dueSoon
		].filter(Boolean).length
	);
	let pushKnown = $state(false);
	let notifSummary = $derived(
		!canNotifySafe()
			? 'Először engedélyezd a böngészőben'
			: !pushKnown
				? `${notifOn}/6 bekapcsolva`
				: pushSt === 'on'
					? `${notifOn}/6 bekapcsolva, push él`
					: notifOn === 0
						? 'Minden jelzés ki'
						: `${notifOn}/6 bekapcsolva, push ki`
	);
	function canNotifySafe(): boolean {
		try {
			return canNotify();
		} catch {
			return false;
		}
	}
	let cardsSummary = $derived(
		`Gyors kvíz: ${settings.quickQuizCount} kérdés · ${settings.autoAudio ? 'automata felolvasás' : 'gombnyomásra olvas fel'}`
	);
	let themeLabel = $derived(
		theme.choice === 'light' ? 'Világos' : theme.choice === 'dark' ? 'Sötét' : 'Rendszer'
	);
	function fontFamilyLabel(f: string): string {
		return f === 'modern' ? 'Modern' : f === 'book' ? 'Könyvszerű' : 'Rendszer';
	}

	let displayLabel = $derived(
		`${fontFamilyLabel(settings.fontFamily)}${settings.reduceMotion ? ' · nyugodt' : ''}${settings.compactList ? ' · kompakt' : ''}`
	);
	let storageSummary = $derived(
		storageInfo.total > 0 ? `${fmtBytes(storageInfo.total)} helyben` : 'Offline és gyorstár'
	);

	const themeOptions: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
		{ id: 'light', label: 'Világos', icon: Sun },
		{ id: 'dark', label: 'Sötét', icon: Moon },
		{ id: 'system', label: 'Rendszer', icon: Smartphone }
	];

	const tile =
		'grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white';
</script>

<svelte:head>
	<title>Beállítások | Leardy</title>
</svelte:head>

<h1 class="font-display -mt-2 text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Beállítások</h1>

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
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{themeLabel} · {displayLabel}</span>
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
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Gyakorlás</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{cardsSummary}</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	<button
		onclick={() => {
			refreshStorageInfo();
			sheet = 'storage';
		}}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Database size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Tárhely</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{storageSummary}</span>
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
<Drawer open={sheet !== null} label={sheet ? sheetTitles[sheet] : ''} title={sheet ? sheetTitles[sheet] : ''} onClose={() => (sheet = null)}>
		{#if sheet === 'account'}
			<div class="mt-3">
				{#if user}
					<div class="flex items-center gap-3.5">
						<span class="grid size-12 shrink-0 place-items-center rounded-full bg-brand-500 text-lg font-extrabold text-white">
							{initial}
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[16px] font-bold text-ink-900 dark:text-white">{user.name}</p>
							<p class="truncate text-[13px] text-ink-400 dark:text-stone-500">{user.email}</p>
						</div>
					</div>
					<div class="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 dark:divide-white/5 dark:border-white/10">
						<button
							type="button"
							onclick={() => {
								nameDraft = user?.name ?? '';
								accountEdit = 'name';
							}}
							class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-white/5 dark:active:bg-white/10"
						>
							<Pencil size={18} class="shrink-0 text-stone-400 dark:text-stone-500" />
							<span class="min-w-0 flex-1">
								<span class="block text-[15px] font-semibold text-ink-900 dark:text-white">Név módosítása</span>
							</span>
							<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
						</button>
					</div>
					<button
						onclick={exportAccountData}
						disabled={exportBusy}
						class="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] disabled:opacity-60 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
					>
						<Database size={17} />
						{exportBusy ? 'Készül…' : 'Adataim letöltése'}
					</button>
					<button
						onclick={() => {
							deleteAccountOpen = true;
						}}
						class="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
					>
						<Trash2 size={17} />
						Fiók törlése
					</button>
					<button
						onclick={() => {
							auth.logout();
							sheet = null;
						}}
						class="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
					>
						<LogOut size={17} />
						Kijelentkezés
					</button>
				{:else}
					<p class="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
						A tanterem és a haladásod mentése fiókhoz kötött.
					</p>
					<div class="mt-4">
						<GoogleLoginButton />
					</div>
				{/if}
			</div>
		{:else if sheet === 'notif'}
			<div class="mt-1">
				<div class="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-white/10 dark:bg-white/5">
					{#if notifPerm !== 'granted'}
						<div class="flex items-start gap-3">
							<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
								<Bell size={20} />
							</span>
							<div class="min-w-0 flex-1">
								<p class="text-[15px] font-bold text-ink-900 dark:text-white">
									{#if notifPerm === 'denied'}
										Az értesítések le vannak tiltva
									{:else if notifPerm === 'unsupported'}
										Nem támogatott ezen az eszközön
									{:else}
										Értesítések engedélyezése
									{/if}
								</p>
								{#if notifPerm !== 'denied' && notifPerm !== 'unsupported'}
									<button
										type="button"
										onclick={enableNotif}
										disabled={notifBusy}
										class="mt-2.5 rounded-full bg-brand-500 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-60"
									>
										{notifBusy ? '…' : 'Értesítések engedélyezése'}
									</button>
								{/if}
							</div>
						</div>
					{:else if pushSt === 'on'}
						<div class="flex items-start gap-3">
							<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
								<BellRing size={20} />
							</span>
							<div class="min-w-0 flex-1">
								<p class="text-[15px] font-bold text-ink-900 dark:text-white">Push bekapcsolva</p>
								<div class="mt-2.5 flex flex-wrap gap-2">
									<button
										type="button"
										onclick={sendTestPush}
										disabled={testBusy}
										class="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-60"
									>
										<Send size={14} />
										{testBusy ? 'Küldés…' : 'Teszt küldése'}
									</button>
									<button
										type="button"
										onclick={togglePush}
										disabled={pushBusy}
										class="rounded-full border border-stone-200 bg-white px-4 py-2 text-[13px] font-bold text-ink-600 transition hover:bg-stone-100 active:scale-95 disabled:opacity-60 dark:border-white/15 dark:bg-transparent dark:text-stone-300 dark:hover:bg-white/10"
									>
										{pushBusy ? '…' : 'Push kikapcsolása'}
									</button>
								</div>
							</div>
						</div>
					{:else if pushSt === 'denied'}
						<div class="flex items-start gap-3">
							<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300">
								<BellOff size={20} />
							</span>
							<div class="min-w-0 flex-1">
								<p class="text-[15px] font-bold text-ink-900 dark:text-white">Le van tiltva a böngészőben</p>
							</div>
						</div>
					{:else if pushSt === 'unsupported'}
						<div class="flex items-start gap-3">
							<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-200 text-stone-500 dark:bg-white/10 dark:text-stone-400">
								<Smartphone size={20} />
							</span>
							<div class="min-w-0 flex-1">
								<p class="text-[15px] font-bold text-ink-900 dark:text-white">Nem támogatott ezen az eszközön</p>
							</div>
						</div>
					{:else}
						<div class="flex items-start gap-3">
							<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-200 text-stone-500 dark:bg-white/10 dark:text-stone-400">
								<Bell size={20} />
							</span>
							<div class="min-w-0 flex-1">
								<p class="text-[15px] font-bold text-ink-900 dark:text-white">Push kikapcsolva</p>
								<button
									type="button"
									onclick={togglePush}
									disabled={pushBusy}
									class="mt-2.5 rounded-full bg-brand-500 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-60"
								>
									{pushBusy ? '…' : 'Push bekapcsolása'}
								</button>
							</div>
						</div>
					{/if}
				</div>

				<p class="mt-5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Tantermi értesítések</p>
				<ul class="divide-y divide-stone-100 dark:divide-white/5">
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Tantermi üzenetek</p>
						<Toggle bind:checked={settings.pushClassMessage} label="Tantermi üzenetek" />
					</li>
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Feladatok és beadandók</p>
						<Toggle bind:checked={settings.pushClassTask} label="Feladatok és beadandók" />
					</li>
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Jegyek és visszajelzések</p>
						<Toggle bind:checked={settings.pushGrades} label="Jegyek és visszajelzések" />
					</li>
				</ul>

				<p class="mt-5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Emlékeztetők</p>
				<ul class="divide-y divide-stone-100 dark:divide-white/5">
					<li class="flex items-center gap-2.5 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Napi emlékeztető</p>
						<input
							type="time"
							value={settings.reminderTime}
							onchange={onReminderTime}
							disabled={!settings.reminder}
							aria-label="Napi időpont"
							class="w-[118px] shrink-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-center text-[15px] font-semibold text-ink-900 tabular-nums outline-none transition [color-scheme:light] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
						/>
						<Toggle bind:checked={settings.reminder} label="Napi emlékeztető" />
					</li>
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Határidőfigyelő</p>
						<Toggle bind:checked={settings.dueSoon} label="Határidőfigyelő" />
					</li>
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Újdonságok</p>
						<Toggle bind:checked={settings.pushFeatures} label="Újdonságok" />
					</li>
				</ul>

				{#if settings.mutedClassrooms.length > 0}
					<p class="mt-5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Némított osztályok</p>
					<div class="mt-2 flex items-center justify-end">
						<button
							type="button"
							onclick={unmuteAll}
							class="shrink-0 rounded-full border border-stone-200 px-3.5 py-2 text-[13px] font-bold text-ink-600 dark:border-white/15 dark:text-stone-300"
						>
							Mind feloldom
						</button>
					</div>
					<ul class="mt-2 grid gap-1.5">
						{#each settings.mutedClassrooms as id (id)}
							<li class="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/5">
								<span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-600 dark:text-stone-300">
									{mutedLoading && !classroomNames[id] ? 'Betöltés…' : mutedName(id)}
								</span>
								<button
									type="button"
									onclick={() => unmuteClassroom(id)}
									class="shrink-0 text-[13px] font-bold text-brand-600 dark:text-brand-400"
								>
									Feloldom
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else if sheet === 'theme'}
			<p class="mt-3 text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Téma</p>
			<div
				role="radiogroup"
				aria-label="Téma"
				class="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10"
			>
				{#each themeOptions as opt (opt.id)}
					{@const Icon = opt.icon}
					{@const selected = theme.choice === opt.id}
					<button
						type="button"
						role="radio"
						aria-checked={selected}
						onclick={() => theme.set(opt.id)}
						class={[
							'flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 transition active:scale-[0.97]',
							selected
								? 'bg-white text-ink-900 shadow-sm dark:bg-stone-800 dark:text-white dark:shadow-black/40'
								: 'text-stone-500 hover:text-ink-900 dark:text-stone-400 dark:hover:text-white'
						]}
					>
						<Icon size={20} />
						<span class={['text-[13px] leading-none', selected ? 'font-extrabold' : 'font-semibold']}>
							{opt.label}
						</span>
					</button>
				{/each}
			</div>
			<div class="mt-3">
				<FontFamilyPicker bind:value={settings.fontFamily} label="Betűtípus" />
			</div>
			<ul class="mt-3 divide-y divide-stone-100 dark:divide-white/5">
				<li class="flex items-center gap-3 py-3">
					<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Mozgás csökkentése</p>
					<Toggle bind:checked={settings.reduceMotion} label="Mozgás csökkentése" />
				</li>
				<li class="flex items-center gap-3 py-3">
					<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Kompakt lista</p>
					<Toggle bind:checked={settings.compactList} label="Kompakt lista" />
				</li>
			</ul>
		{:else if sheet === 'cards'}
			<ul class="mt-1 divide-y divide-stone-100 dark:divide-white/5">
				<li class="flex items-center gap-3 py-3">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Gyors kvíz kérdésszáma</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<button
							type="button"
							onclick={() => (settings.quickQuizCount = Math.max(1, settings.quickQuizCount - 1))}
							aria-label="Eggyel kevesebb"
							class="grid size-9 place-items-center rounded-full border border-stone-200 text-lg font-bold text-ink-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/10"
						>
							−
						</button>
						<span class="w-8 text-center text-[15px] font-extrabold text-ink-900 tabular-nums dark:text-white">
							{settings.quickQuizCount}
						</span>
						<button
							type="button"
							onclick={() => (settings.quickQuizCount = Math.min(50, settings.quickQuizCount + 1))}
							aria-label="Eggyel több"
							class="grid size-9 place-items-center rounded-full border border-stone-200 text-lg font-bold text-ink-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/10"
						>
							+
						</button>
					</div>
				</li>
				<li class="flex items-center gap-3 py-3">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Automatikus felolvasás</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">Forgatás után felolvassa az idegen szót</p>
					</div>
					<Toggle bind:checked={settings.autoAudio} label="Automatikus felolvasás" />
				</li>
			</ul>
		{:else if sheet === 'storage'}
			<div class="mt-3">
				<div class="rounded-2xl border border-stone-200 p-4 dark:border-white/10">
					<p class="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
						<HardDrive size={13} /> Helyi adatok
					</p>
					<p class="mt-1 text-[20px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{fmtBytes(storageInfo.total)}
					</p>
					<ul class="mt-2 grid gap-1 text-[13px] text-stone-500 dark:text-stone-400">
						<li class="flex items-center justify-between gap-2">
							<span>Offline kártyakönyvtár</span>
							<span class="font-bold text-ink-900 tabular-nums dark:text-white">{fmtBytes(storageInfo.lib)}</span>
						</li>
						<li class="flex items-center justify-between gap-2">
							<span>Oldalszűrők</span>
							<span class="font-bold text-ink-900 tabular-nums dark:text-white">{fmtBytes(storageInfo.scope)}</span>
						</li>
						<li class="flex items-center justify-between gap-2">
							<span>Értesítési jelzők</span>
							<span class="font-bold text-ink-900 tabular-nums dark:text-white">{fmtBytes(storageInfo.seen)}</span>
						</li>
					</ul>
					<p class="mt-2 text-[12px] leading-relaxed text-stone-400 dark:text-stone-500">
						A beállításaid és a témád megmaradnak ürítéskor is.
					</p>
				</div>
				<div class="mt-2.5 grid gap-2">
					<button
						type="button"
						onclick={clearOfflineLibrary}
						disabled={storageBusy || storageInfo.lib === 0}
						class="flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[15px] font-bold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
					>
						{storageBusy ? 'Ürítés…' : 'Offline tárhely ürítése'}
					</button>
					<button
						type="button"
						onclick={clearAllCache}
						disabled={storageBusy || storageInfo.total === 0}
						class="flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.99] disabled:opacity-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
					>
						{storageBusy ? 'Ürítés…' : 'Összes gyorstár ürítése'}
					</button>
				</div>
			</div>
		{:else if sheet === 'about'}
			<div class="mt-3">
				<div class="flex items-center justify-between py-2.5">
					<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Verzió</p>
					<p class="text-sm text-ink-400 tabular-nums dark:text-stone-500">{APP_VERSION}</p>
				</div>
				<div class="flex items-center justify-between py-2.5">
					<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Utolsó frissítés</p>
					<p class="text-sm text-ink-400 tabular-nums dark:text-stone-500">{appBuildLabel()}</p>
				</div>
				<button
					type="button"
					onclick={() => (whatsNewOpen = true)}
					class="mt-1 flex w-full items-center gap-3 rounded-2xl bg-brand-50 p-4 text-left transition hover:bg-brand-100 active:scale-[0.99] dark:bg-brand-500/15 dark:hover:bg-brand-500/25"
				>
					<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-white">
						<Sparkles size={22} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Újdonságok</span>
						<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">
							Frissítés - {LATEST_CHANGE.version}: {LATEST_CHANGE.title.toLowerCase()}
						</span>
					</span>
					<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
				<a
					href="mailto:hello@leardy.app?subject=Leardy%20visszajelz%C3%A9s%20({APP_VERSION})"
					class="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
				>
					<span class={tile}>
						<MessageCircle size={22} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Visszajelzés küldése</span>
						<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Hiba vagy ötlet? Írj nekünk emailt.</span>
					</span>
					<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</a>
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
						<span class="font-normal text-ink-600 dark:text-stone-400"> és</span>
						<a
							href="https://www.facebook.com/bercel.fidrich.5"
							target="_blank"
							rel="noopener noreferrer"
							class="text-brand-600 underline decoration-brand-300 underline-offset-2 dark:text-brand-400"
						>
							Fidrich Bercel
						</a>
					</p>
				</div>
				<p class="mt-2.5 rounded-xl bg-stone-100 p-3.5 text-[13px] leading-relaxed text-ink-600 dark:bg-white/5 dark:text-stone-400">
					A Ferences Ösztöndíj Programra készült a 2026/27-es tanévben.
				</p>
			</div>
		{/if}
</Drawer>

<!-- Új drawer: név módosítása -->
<Drawer
	open={accountEdit !== null}
	label={accountEdit ? accountEditTitles[accountEdit] : ''}
	title={accountEdit ? accountEditTitles[accountEdit] : ''}
	onClose={closeAccountEdit}
>
	{#if accountEdit === 'name'}
		<form onsubmit={saveName} class="mt-3 space-y-3.5" novalidate>
			<div>
				<label for="account-name" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Név</label>
				<input
					id="account-name"
					type="text"
					autocomplete="name"
					placeholder="Add meg a neved"
					bind:value={nameDraft}
					disabled={busyName}
					class={inputCls}
				/>
			</div>
			<button type="submit" disabled={busyName} class={primaryCls}>
				{busyName ? 'Mentés…' : 'Név mentése'}
			</button>
		</form>
	{/if}
</Drawer>

<WhatsNew open={whatsNewOpen} onClose={() => (whatsNewOpen = false)} />

<ConfirmDialog
	open={deleteAccountOpen}
	title="Fiók törlése"
	description="A haladásod, kártyáid, beküldéseid és tagságaid végleg törlődnek. Teli saját osztály esetén előbb azt töröld. Ez nem vonható vissza."
	confirmLabel="Törlöm a fiókom"
	busy={deleteAccountBusy}
	onClose={() => {
		if (!deleteAccountBusy) deleteAccountOpen = false;
	}}
	onConfirm={deleteAccount}
/>
