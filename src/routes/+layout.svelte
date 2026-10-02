<script lang="ts">
	import '../app.css';
	import '$lib/theme.svelte';
	import type { Snippet } from 'svelte';
	import { browser, dev } from '$app/environment';
	import { page } from '$app/state';
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
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
	let user = $derived(auth.ready ? auth.user : (data.user ?? null));

	// PWA: a web manifest link a head-be, a service worker regisztracio kliensoldalon.
	// Nelkuluk a bongeszo nem kinalja fel a "Telepites" gombot.
	let webManifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');

	onMount(async () => {
		if (!browser) return;
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
		try {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({
				immediate: true,
				onRegisterError(error: unknown) {
					console.warn('SW registration error', error);
				}
			});
		} catch (error) {
			console.warn('SW registration error', error);
		}
	});

	// Kliens indulaskor azonnal szinkronizalunk, hogy a gyerekek
	// (Sidebar, fooldal) mar az elso paintkor latjak a usert.
	// svelte-ignore state_referenced_locally: szandekosan csak a kezdeti ertek kell.
	if (browser && !auth.ready) auth.seed(data.user ?? null);

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
		auth.seed(data.user ?? null);
	});

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

<svelte:head>
	<title>Leardy: Tanulj okosan</title>
	{@html webManifestLink}
</svelte:head>

{#if !user}
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
