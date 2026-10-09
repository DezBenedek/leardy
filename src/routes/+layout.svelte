<script lang="ts">
	import '../app.css';
	import '$lib/theme.svelte';
	import type { Snippet } from 'svelte';
	import { browser, dev } from '$app/environment';
	import { page } from '$app/state';
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { isLearningPath } from '$lib/content-protocol';
	import { startContentSync, invalidateContent, offlineIdentity } from '$lib/content-client';
	import { startProgressSync, syncProgress, outbox, dismissProgress } from '$lib/progress-outbox.svelte';
	import { startPwaUpdates } from '$lib/pwa-client';
	import { pwaInfo } from 'virtual:pwa-info';
	import { auth } from '$lib/auth.svelte';
	import AuthDrawer from '$lib/components/AuthDrawer.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import GoogleLoginButton from '$lib/components/GoogleLoginButton.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import { toast } from '$lib/toast.svelte';
	import WhatsNew from '$lib/components/WhatsNew.svelte';
	import { startNotificationEngine } from '$lib/notifications';
	import { loadSettings } from '$lib/settings';
	import { applyDisplaySettings, shouldAnimate } from '$lib/display';
	import { LATEST_CHANGE, getSeenWhatsNew } from '$lib/changelog';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	let connected = $state(true);
	let learningPage = $derived(isLearningPath(page.url.pathname));
	let offlineLearning = $derived(learningPage && (!connected || data.offline));
	function reconnect() {
		connected = true;
		void invalidate('app:session');
	}
	onMount(() => {
		connected = navigator.onLine;
		const stopContent = startContentSync();
		const stopProgress = startProgressSync();
		return () => { stopContent(); stopProgress(); };
	});

	$effect(() => {
		if (page.status !== 404 && page.status !== 410) return;
		const lesson = /^\/tanulas\/lecke\/([^/]+)\/?$/.exec(page.url.pathname);
		if (lesson) void invalidateContent({ action: 'deleteLesson', lessonId: decodeURIComponent(lesson[1]) });
	});

	onMount(() => {
		startNotificationEngine();
		try {
			applyDisplaySettings(loadSettings());
		} catch {
			// nem kritikus
		}
	});

	// "Frissítés - VERZIÓSZÁM" felugró: bejelentkezve, verziónként max. 1x.
	// Nincs "ütemezve" jelző: az effectben írt jelző azonnal újrafuttatná
	// az effectet, a cleanup pedig törölné az időzítőt (sosem nyílna ki).
	// Az újramegnyitást a megtekintés megjegyzése (seen) akadályozza meg.
	let whatsNewOpen = $state(false);
	// SSR alatt es az elso kliens paintkor meg nincs ready auth,
	// ilyenkor a szerveres layout-adat a forras, igy nincs login-villanas.
	// Kesz auth utan a kliens store az igazsag (login/logout azonnal latszik).
	let user = $derived.by(() => {
		const current = auth.ready ? auth.user : data.user;
		if (current || !offlineLearning) return current;
		const remembered = offlineIdentity();
		return remembered ? { ...remembered, email: '' } : null;
	});

	// PWA: a web manifest link a head-be, a service worker regisztracio kliensoldalon.
	// Nelkuluk a bongeszo nem kinalja fel a "Telepites" gombot.
	let webManifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');

	onMount(() => {
		let stopped = false;
		let stopUpdates: (() => void) | undefined;
		async function registerPwa() {
			if (dev) {
				const resetKey = 'leardy-dev-service-worker-reset';
				try {
					const sw = navigator.serviceWorker;
					if (!sw) return;
					const registrations = await sw.getRegistrations();
					const controlled = !!sw.controller;
					if (registrations.length > 0) {
						await Promise.all(registrations.map((registration) => registration.unregister()));
					}
					const oldCaches = (await caches.keys()).filter(
						(key) => key.startsWith('leardy-static-') || key.startsWith('workbox-')
					);
					await Promise.all(oldCaches.map((key) => caches.delete(key)));
					if (controlled && sessionStorage.getItem(resetKey) !== '1') {
						sessionStorage.setItem(resetKey, '1');
						location.reload();
						return;
					}
					if (!controlled) sessionStorage.removeItem(resetKey);
				} catch (error) {
					console.warn('Fejlesztői service worker takarítási hiba', error);
				}
				return;
			}
			if (!pwaInfo) return;
			if (!stopped) stopUpdates = startPwaUpdates();
		}
		void registerPwa();
		return () => {
			stopped = true;
			stopUpdates?.();
		};
	});

	// Kliens indulaskor azonnal szinkronizalunk, hogy a gyerekek
	// (Sidebar, fooldal) mar az elso paintkor latjak a usert.
	// svelte-ignore state_referenced_locally: szandekosan csak a kezdeti ertek kell.
	if (browser && !auth.ready && !data.offline) auth.seed(data.user ?? null);

	$effect(() => {
		if (!user) return;
		if (getSeenWhatsNew() === LATEST_CHANGE.version) return;
		const t = setTimeout(() => {
			whatsNewOpen = true;
		}, 1500);
		return () => clearTimeout(t);
	});

	// A session szerverről jön: paint előtt beáll, splash nincs.
	// Kliensoldali navigációnál a friss layout-adat szinkronizál.
	$effect.pre(() => {
		if (!data.offline) auth.seed(data.user ?? null);
	});
	$effect(() => { if (user?.id) void syncProgress(); });

	// Google OAuth hibák visszajelzése a callback átirányítás után (?auth_error=...).
	// onMount + window.location: nem reaktív, ezért egyszer fut, nincs végtelen ciklus,
	// és nem kell a router inicializálására várni.
	onMount(() => {
		if (!browser) return;
		let err: string | null = null;
		try {
			err = new URL(window.location.href).searchParams.get('auth_error');
		} catch {
			return;
		}
		if (!err) return;
		if (err === 'domain') {
			toast.error('Csak iskolai fiók', 'Csak @szentangela.hu végű Google fiókkal lehet belépni.');
		} else if (err === 'config') {
			toast.error('Belépés nem elérhető', 'Hiányzik a Google OAuth beállítás. Szólj a rendszergazdának.');
		} else if (err === 'db') {
			toast.error('Adatbázis nem elérhető', 'Helyi devben használd a wrangler dev parancsot.');
		} else {
			toast.error('Sikertelen belépés', 'Próbáld újra Google fiókkal.');
		}
		try {
			const url = new URL(window.location.href);
			url.searchParams.delete('auth_error');
			window.history.replaceState({}, '', url.toString());
		} catch {
			// nem kritikus
		}
	});

	// Minden oldalváltás sima áttűnés, az első megnyílás is.
	// A main kulcsolva van az útvonalra, így kliensnavigációnál is
	// újra lefut az in:fade (kulcs nélkül csak az első mountkor futna).
	function fadeParams(): { duration: number } {
		return shouldAnimate() ? { duration: 180 } : { duration: 0 };
	}
</script>

<svelte:window onoffline={() => connected = false} ononline={reconnect} />

<svelte:head>
	<title>Leardy: Tanulj okosan</title>
	{@html webManifestLink}
</svelte:head>

{#snippet progressNotices()}
	{#if learningPage && outbox.pending > 0}
		<p role="status" class="mb-3 text-sm text-stone-500">{outbox.pending} eredmény mentésre vár.</p>
	{/if}
	{#if learningPage}
		{#each outbox.rejected as result (result.eventId)}
			<div role="status" class="mb-3 rounded-xl border border-amber-300 p-3 text-sm">
				A korábbi eredményed: {result.score}/{result.total}. {result.status === 'deleted' ? 'A leckét törölték.' : 'A kérdéssor megváltozott, új kitöltés szükséges.'}
				<button class="ml-2 font-bold underline" onclick={() => void dismissProgress(result.eventId)}>Rendben</button>
			</div>
		{/each}
	{/if}
{/snippet}

{#if offlineLearning && !user}
	<main class="mx-auto min-h-dvh w-full max-w-3xl px-4 py-5 sm:px-6">
		{@render progressNotices()}
		{@render children()}
	</main>
{:else if !user}
	<!-- Auth-gate: be nem lépve az app nem használható, csak Google belépés -->
	<div class="mx-auto grid min-h-dvh w-full max-w-md place-items-center px-6">
		<div class="w-full text-center">
			<div class="flex justify-center">
				<Logo />
			</div>
			<h1 class="font-display mt-6 text-[28px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
				Tanulj okosan a Leardyvel
			</h1>
			<div class="mt-6">
				<GoogleLoginButton />
			</div>
		</div>
	</div>
	<AuthDrawer />
{:else}
	<div class="mx-auto flex min-h-dvh w-full max-w-6xl">
		<Sidebar user={user} />
		<div class="min-w-0 flex-1 overflow-x-clip">
			{#key page.url.pathname}
				<main
					in:fade={fadeParams()}
					class="mx-auto w-full max-w-3xl px-4 pt-5 pb-36 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12"
				>
						{@render progressNotices()}
					{@render children()}
				</main>
			{/key}

		</div>
	</div>

	<AuthDrawer />
	<BottomNav />
	<WhatsNew open={whatsNewOpen} onClose={() => (whatsNewOpen = false)} />
{/if}
<Toaster />
