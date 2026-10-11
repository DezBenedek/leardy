<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';

	/* Ujrahasznalhato vizszintes lapozo: az elozo, az aktualis es a kovetkezo
	   oldal mindig elore be van toltve, huzas kozben a sav mar koveti az
	   ujjat, elengedeskor pedig atcsusszan vagy visszarug.
	   A fuggoleges gorgtest nem bantja. Hasznalat:
	     <SwipePager count={n} index={idx} onIndex={(i) => (idx = i)}>
	       {#snippet page(i)}
	         ... a CHANGES[i] tartalma ...
	       {/snippet}
	     </SwipePager>
	   A nyilakkal/pottyokkel torteno leptetes is animalt (szomszedra csuszik,
	   tavolra ugrik). Mozgas-csokkentesnel nincs mozgas, csak tartalomcsere. */

	interface Props {
		count: number;
		index: number;
		onIndex: (i: number) => void;
		/** Ennyi px huzas valt oldalt. Alap: a szelesseg 18%-a, min. 48. */
		threshold?: number;
		page: Snippet<[number]>;
	}

	let { count, index, onIndex, threshold, page }: Props = $props();

	const ANIM_MS = 200;

	let w = $state(0);
	let internal = $state(0);
	let offset = $state(0);
	let anim = $state(false);

	let initialized = false;

	let busy = false;
	let touchActive = false;
	let swipeId = -1;
	let startX = 0;
	let startY = 0;
	let startT = 0;
	let timer: number | null = null;

	let slots = $derived(w > 0 ? [internal - 1, internal, internal + 1] : [internal]);
	let limit = $derived(threshold ?? Math.max(48, w * 0.18));
	let tx = $derived(slots.length === 3 && w > 0 ? -w + offset : 0);

	function reduceMotion(): boolean {
		try {
			if (document.documentElement.classList.contains('reduce-motion')) return true;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
		} catch {
			return false;
		}
		return false;
	}

	function clearTimer() {
		if (timer !== null) {
			window.clearTimeout(timer);
			timer = null;
		}
	}

	onDestroy(clearTimer);

	function commit(i: number) {
		clearTimer();
		busy = false;
		internal = i;
		offset = 0;
		anim = false;
		onIndex(i);
	}

	function animateTo(px: number, done: () => void) {
		clearTimer();
		if (reduceMotion() || w <= 0) {
			done();
			return;
		}
		busy = true;
		anim = true;
		offset = px;
		timer = window.setTimeout(() => {
			timer = null;
			busy = false;
			done();
		}, ANIM_MS + 30);
	}

	function snapBack() {
		if (reduceMotion() || w <= 0) {
			clearTimer();
			busy = false;
			offset = 0;
			anim = false;
			return;
		}
		animateTo(0, () => {
			anim = false;
		});
	}

	// Kulso indexvaltozas (nyilak, pottyok): szomszedra csuszunk, tavolra ugrunk.
	$effect(() => {
		const target = Math.max(0, Math.min(count - 1, index));
		if (!initialized) {
			initialized = true;
			internal = target;
			return;
		}
		if (target === internal || touchActive) return;
		if (busy || reduceMotion() || w <= 0 || Math.abs(target - internal) !== 1) {
			clearTimer();
			busy = false;
			internal = target;
			offset = 0;
			anim = false;
			return;
		}
		animateTo((internal - target) * w, () => commit(target));
	});

	function findTouch(list: TouchList, ident: number): Touch | null {
		for (let i = 0; i < list.length; i++) {
			const c = list.item(i);
			if (c && c.identifier === ident) return c;
		}
		return null;
	}

	function onTouchStart(e: TouchEvent) {
		if (busy || touchActive) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
		const t = e.changedTouches[0];
		touchActive = true;
		swipeId = t.identifier;
		startX = t.clientX;
		startY = t.clientY;
		startT = performance.now();
	}

	function onTouchMove(e: TouchEvent) {
		if (!touchActive || busy) return;
		const t = findTouch(e.changedTouches, swipeId);
		if (!t) return;
		const dx = t.clientX - startX;
		const dy = t.clientY - startY;
		if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
		// Fuggoleges mozdulat: atadjuk a gorgtestnek.
		if (Math.abs(dx) <= Math.abs(dy) * 1.2) {
			touchActive = false;
			return;
		}
		if (reduceMotion() || w <= 0) return;
		let x = dx;
		// Szelso oldalakon tulhuzasnal ellenallas, belul max. egy oldalnyit kovet.
		if ((internal <= 0 && x > 0) || (internal >= count - 1 && x < 0)) x *= 0.3;
		offset = Math.max(-w, Math.min(w, x));
	}

	function endTouch(e: TouchEvent, cancelled: boolean) {
		if (!touchActive) return;
		const t = findTouch(e.changedTouches, swipeId);
		touchActive = false;
		if (!t || cancelled) {
			offset = 0;
			return;
		}
		const dx = t.clientX - startX;
		const dt = performance.now() - startT;
		const flick = Math.abs(dx) >= 32 && dt <= 250;
		const dir = dx < 0 ? 1 : -1;
		const target = internal + dir;
		if ((Math.abs(dx) >= limit || flick) && target >= 0 && target < count) {
			if (reduceMotion() || w <= 0) {
				commit(target);
			} else {
				animateTo(-dir * w, () => commit(target));
			}
			return;
		}
		snapBack();
	}

	function onTouchEnd(e: TouchEvent) {
		endTouch(e, false);
	}

	function onTouchCancel(e: TouchEvent) {
		endTouch(e, true);
	}
</script>

<div
	bind:clientWidth={w}
	role="presentation"
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
	ontouchcancel={onTouchCancel}
	class="touch-pan-y overflow-hidden"
>
	<div
		class="flex items-start"
		style="transform: translateX({tx}px); transition: {anim
			? `transform ${ANIM_MS}ms cubic-bezier(0.32,0.72,0,1)`
			: 'none'};"
	>
		{#each slots as n (n)}
			{#if n >= 0 && n < count}
				<div class="w-full shrink-0">
					{@render page(n)}
				</div>
			{:else}
				<div class="w-full shrink-0" aria-hidden="true"></div>
			{/if}
		{/each}
	</div>
</div>
