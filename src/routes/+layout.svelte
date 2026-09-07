<script lang="ts">
	import '../app.css';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { TAB_ORDER } from '$lib/navigation';

	let { children } = $props();

	// Jobbra-balra csúszás a fülek sorrendje alapján:
	// jobbra lépés → új oldal jobbról csúszik be, vissza → balról.
	let dir = $state(1);
	let ready = $state(false);

	function tabIndex(pathname: string | undefined): number {
		if (!pathname) return -1;
		return TAB_ORDER.indexOf(pathname);
	}

	beforeNavigate(({ from, to }) => {
		const f = tabIndex(from?.url.pathname);
		const t = tabIndex(to?.url.pathname);
		if (f >= 0 && t >= 0) dir = t === f ? 0 : t > f ? 1 : -1;
		else if (t < 0) dir = 1;
		else dir = -1;
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
				in:fly={ready && dir !== 0
					? { x: 56 * dir, duration: 220, easing: cubicOut }
					: { duration: 0 }}
				class="mx-auto w-full max-w-3xl px-4 pt-5 pb-36 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12"
			>
				{@render children()}
			</main>
		{/key}
		<footer class="hidden px-8 pb-8 lg:block">
			<p class="mx-auto max-w-3xl text-xs text-ink-400">
				Leardy · Cloudflare Workers + D1 alapon készül · PWA-ként telepíthető
			</p>
		</footer>
	</div>
</div>

<BottomNav />
