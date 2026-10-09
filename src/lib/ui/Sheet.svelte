<script lang="ts">
	import { browser } from '$app/environment';
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { isTopOverlay, lockBody, motionOK } from '$lib/overlay';
	import { fitOverlayViewport } from '$lib/overlay-viewport';

	interface Props {
		open: boolean;
		label: string;
		title?: string;
		wide?: boolean;
		onClose: () => void;
		children: Snippet;
		footer?: Snippet;
	}

	let { open, label, title, wide = false, onClose, children, footer }: Props = $props();

	let panel: HTMLElement | null = $state(null);
	let scroller: HTMLElement | null = $state(null);
	let render = $state(false);
	let shown = $state(false);
	let dragging = $state(false);
	let dragY = $state(0);
	let startY = 0;
	let returnTo: HTMLElement | null = null;
	// Gyors nyit-csuk sorozatnal az elavult rAF es idozito nem irhatja
	// felul az uj allapotot: minden atmenet sajat sorszamot kap.
	let generation = 0;
	// Tartalomból indított határozott lehúzás érzékelése.
	let swipeId: number | null = $state(null);
	let swipeY = 0;
	let swipeT = 0;
	let swipeScroll = 0;

	const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;
	const CLOSE_AT = 110;
	// Nyitáskor dől el: az app Mozgás-csökkentője és az OS kérése is számít.
	let animOn = $state(true);
	const outMs = $derived(animOn ? 230 : 0);
	const anim = $derived(animOn ? 'duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]' : 'duration-0');

	$effect(() => {
		if (open) {
			const gen = ++generation;
			animOn = motionOK();
			if (browser && document.activeElement instanceof HTMLElement) returnTo = document.activeElement;
			render = true;
			const raf = requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					if (gen !== generation) return;
					shown = true;
					panel?.focus({ preventScroll: true });
				})
			);
			return () => cancelAnimationFrame(raf);
		} else {
			const gen = ++generation;
			shown = false;
			const t = setTimeout(() => {
				if (gen !== generation) return;
				render = false;
				if (browser && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
				returnTo = null;
			}, outMs + 30);
			return () => clearTimeout(t);
		}
	});

	$effect(() => {
		if (!browser || !render) return;
		return lockBody();
	});

	function beginClose() {
		if (!render) {
			onClose();
			return;
		}
		dragging = false;
		dragY = 0;
		const gen = ++generation;
		shown = false;
		setTimeout(() => {
			if (gen !== generation) return;
			onClose();
		}, outMs);
	}

	function onKey(e: KeyboardEvent) {
		if (!isTopOverlay(panel)) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			beginClose();
			return;
		}
		if (e.key !== 'Tab' || !panel) return;
		const items = panel.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		const list = [...items].filter((el) => el.offsetParent !== null || el === document.activeElement);
		if (list.length === 0) {
			e.preventDefault();
			panel.focus();
			return;
		}
		const first = list[0];
		const last = list[list.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	function handleDown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		dragging = true;
		startY = e.clientY;
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// capture nélkül is működik
		}
	}

	function handleMove(e: PointerEvent) {
		if (!dragging) return;
		const dy = e.clientY - startY;
		dragY = dy <= 0 ? 0 : dy;
	}

	function handleUp() {
		if (!dragging) return;
		dragging = false;
		if (dragY > CLOSE_AT) beginClose();
		else dragY = 0;
	}

	function contentTouchStart(e: TouchEvent) {
		if (swipeId !== null) return;
		const target = e.target as HTMLElement | null;
		// Beviteli mezőből induló mozdulatot nem értelmezünk zárásként.
		if (target?.closest?.('input, textarea, select, [contenteditable="true"], [data-scrollable-text]')) return;
		const t = e.changedTouches[0];
		swipeId = t.identifier;
		swipeY = t.clientY;
		swipeT = performance.now();
		swipeScroll = scroller?.scrollTop ?? 0;
	}

	function contentTouchEnd(e: TouchEvent) {
		if (swipeId === null) return;
		let t: Touch | null = null;
		for (let i = 0; i < e.changedTouches.length; i++) {
			const c = e.changedTouches.item(i);
			if (c && c.identifier === swipeId) t = c;
		}
		swipeId = null;
		if (!t || !scroller) return;
		const dy = t.clientY - swipeY;
		const dt = performance.now() - swipeT;
		// Csak akkor csukunk, ha a tartalom végig a tetején állt, és a mozdulat
		// határozott lefelé rántás volt: a sima görgetést nem bántjuk.
		if (swipeScroll <= 0 && scroller.scrollTop <= 0 && dy >= CLOSE_AT && dt <= 600) beginClose();
	}
</script>

{#if render}
	<div {@attach fitOverlayViewport} class="overlay-viewport fixed inset-0 z-[70]" role="presentation" onkeydown={onKey}>
		<button
			type="button"
			tabindex="-1"
			aria-label="Bezárás"
			onclick={beginClose}
			class={[
				'absolute inset-0 bg-ink-900/45 transition-opacity motion-reduce:transition-none dark:bg-black/60',
				animOn ? 'duration-200' : 'duration-0',
				shown ? 'opacity-100' : 'pointer-events-none opacity-0'
			]}
		></button>
		<div class="pointer-events-none absolute inset-0 flex items-end justify-center sm:items-center sm:p-4">
			<div
				bind:this={panel}
				tabindex="-1"
				role="dialog"
				aria-modal="true"
				aria-label={title ? undefined : label}
				aria-labelledby={title ? titleId : undefined}
				class={[
					'pointer-events-auto relative flex max-h-[92%] w-full flex-col bg-white shadow-2xl outline-none dark:bg-stone-900',
					wide ? 'sm:max-w-xl' : 'sm:max-w-md',
					'rounded-t-(--radius-sheet) sm:rounded-(--radius-sheet)',
					anim,
					shown
						? 'translate-y-0 opacity-100 sm:scale-100'
						: 'translate-y-full opacity-100 sm:translate-y-10 sm:scale-[0.98] sm:opacity-0'
				]}
				style={dragging && dragY > 0
					? `transform: translateY(${dragY}px); transition: none;`
					: undefined}
			>
				<div
					class="shrink-0 cursor-grab touch-none pt-3 pb-1 select-none active:cursor-grabbing sm:hidden"
					aria-hidden="true"
					role="presentation"
					onpointerdown={handleDown}
					onpointermove={handleMove}
					onpointerup={handleUp}
					onpointercancel={handleUp}
				>
					<div class="mx-auto h-1.5 w-11 rounded-full bg-stone-200 dark:bg-white/15"></div>
				</div>
				<div
					bind:this={scroller}
					data-overlay-scroller
					role="presentation"
					ontouchstart={contentTouchStart}
					ontouchend={contentTouchEnd}
					class="min-h-0 overflow-y-auto overscroll-contain"
				>
					<div class="px-5 pt-2 pb-5 sm:px-6 sm:pb-6">
						{#if title}
							<div class="flex items-center gap-2">
								<h2
									id={titleId}
									class="font-display min-w-0 flex-1 text-[20px] leading-snug font-extrabold tracking-tight text-ink-900 dark:text-white"
								>
									{title}
								</h2>
								<button
									type="button"
									onclick={beginClose}
									aria-label="Bezárás"
									class="hidden size-9 shrink-0 place-items-center rounded-full text-stone-400 transition duration-300 hover:rotate-90 hover:bg-stone-100 hover:text-ink-900 active:scale-95 motion-reduce:transition-none motion-reduce:hover:rotate-0 sm:grid dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white"
								>
									<X size={18} />
								</button>
							</div>
						{/if}
						{@render children()}
						{#if footer}
							<div class="mt-4">{@render footer()}</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.overlay-viewport[data-keyboard='true']) [role='dialog'] { max-height: calc(100% - 12px); }
	:global(.overlay-viewport[data-keyboard='true']) [data-overlay-scroller] { scroll-padding-block: 16px; }
</style>
