<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { fade } from 'svelte/transition';
	import AuthDrawer from '$lib/components/AuthDrawer.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import GlobalPlayer from '$lib/components/GlobalPlayer.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { online } from '$lib/online.svelte';
	import { outbox } from '$lib/outbox.svelte';

	let { children } = $props();

	// Minden oldalváltás sima áttűnés.
	let ready = $state(false);

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
				in:fade={ready ? { duration: 180 } : { duration: 0 }}
				class="mx-auto w-full max-w-3xl px-4 pt-5 pb-36 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12"
			>
				{@render children()}
			</main>
		{/key}

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
