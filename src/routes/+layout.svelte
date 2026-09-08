<script lang="ts">
	import '../app.css';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import AuthDrawer from '$lib/components/AuthDrawer.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import GlobalPlayer from '$lib/components/GlobalPlayer.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { online } from '$lib/online.svelte';
	import { outbox } from '$lib/outbox.svelte';
	import { TAB_ORDER } from '$lib/navigation';

	let { children } = $props();

	// Jobbra-balra csúszás csak fül → fül között (a fülek sorrendje alapján).
	// Minden más oldalváltás (részletezők, lejátszók, beállítások) finom felúszást kap.
	let dir = $state(1);
	let slide = $state(true);
	let ready = $state(false);

	function tabIndex(pathname: string | undefined): number {
		if (!pathname) return -1;
		return TAB_ORDER.indexOf(pathname);
	}

	beforeNavigate(({ from, to }) => {
		const f = tabIndex(from?.url.pathname);
		const t = tabIndex(to?.url.pathname);
		if (f >= 0 && t >= 0) {
			slide = true;
			dir = t === f ? 0 : t > f ? 1 : -1;
		} else {
			slide = false;
			dir = 1;
		}
	});

	$effect(() => {
		ready = true;
	});
</script>

<svelte:head>
	<title>Leardy — Tanulj okosan</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-6xl">
	<Sidebar />
	<div class="min-w-0 flex-1 overflow-x-clip">
		{#key page.url.pathname}
			<main
				in:fly={ready
					? slide && dir !== 0
						? { x: 56 * dir, duration: 220, easing: cubicOut }
						: !slide
							? { y: 26, duration: 240, easing: cubicOut }
							: { duration: 0 }
					: { duration: 0 }}
				class="mx-auto w-full max-w-3xl px-4 pt-5 pb-36 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12"
			>
				{@render children()}
			</main>
		{/key}
		<footer class="hidden px-8 pb-8 lg:block">
			<p class="mx-auto max-w-3xl text-xs text-ink-400 dark:text-stone-500">
				Leardy · Cloudflare Workers + D1 alapon készül · PWA-ként telepíthető
			</p>
		</footer>
	</div>
</div>

<AuthDrawer />
<GlobalPlayer />
{#if !online.online}
	<p
		role="status"
		class="fixed inset-x-0 top-0 z-[80] px-4 py-2 text-center text-[13px] font-bold text-white tabular-nums"
		style="background: #b45309; padding-top: max(0.5rem, env(safe-area-inset-top))"
	>
		Offline
		{#if outbox.pending > 0}
			· {outbox.pending} művelet várakozik beküldésre
		{:else}
			· a mentett adatok látszanak
		{/if}
	</p>
{:else if outbox.pending > 0}
	<p
		role="status"
		class="fixed inset-x-0 top-0 z-[80] px-4 py-2 text-center text-[13px] font-bold text-white tabular-nums"
		style="background: #047857; padding-top: max(0.5rem, env(safe-area-inset-top))"
	>
		Beküldés… ({outbox.pending})
	</p>
{/if}
<BottomNav />
