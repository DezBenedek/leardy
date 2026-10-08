<script lang="ts">
	import { browser } from '$app/environment';
	import { ArrowLeft, Pencil, X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { lockBody, motionOK } from '$lib/overlay';

	interface Props {
		open: boolean;
		label: string;
		/** Fejléc-cím helyes arányokkal (cím + X egy sorban). Ha nincs, a tartalom hozza. */
		title?: string;
		/** Egyedi fejléc, például mezőcímke és mentés gomb főcím nélkül. */
		header?: Snippet;
		/** Ha adott, a cím bal oldalán vissza-nyíl jelenik meg (alnezetekhez). */
		onBack?: () => void;
		/** Ha adott, az X-től balra ceruza ikon jelenik meg (szerkesztéshez). */
		onEdit?: () => void;
		editLabel?: string;
		onClose: () => void;
		children: Snippet;
		/** Gépen szélesebb párbeszéd (pl. választók, hosszú űrlapok). */
		wide?: boolean;
		/** A panel magassága finoman követi a tartalom változását. */
		animateHeight?: boolean;
	}

	let { open, label, title, header, onBack, onEdit, editLabel = 'Szerkesztés', onClose, children, wide = false, animateHeight = false }: Props = $props();

	let panel: HTMLElement | null = $state(null);
	let scroller: HTMLElement | null = $state(null);
	let handle: HTMLElement | null = $state(null);
	let panelHeight = $state<number | undefined>(undefined);
	let render = $state(false);
	let shown = $state(false);
	// Gyors nyit-csuk sorozatnal az elavult rAF es idozito nem irhatja
	// felul az uj allapotot: minden atmenet sajat sorszamot kap.
	let generation = 0;
	let dragging = $state(false);
	let dragY = $state(0);
	let startY = 0;
	// Tartalomból indított határozott lehúzás érzékelése.
	let swipeId: number | null = $state(null);
	let swipeY = 0;
	let swipeT = 0;
	let swipeScroll = 0;

	const CLOSE_AT = 110;
	// Nyitáskor dől el: az app Mozgás-csökkentője és az OS kérése is számít.
	// (A modulszintű matchMedia csak az OS-t nézte, a beállítást nem.)
	let animOn = $state(true);
	const outMs = $derived(animOn ? 230 : 0);
	const anim = $derived(animOn ? 'duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]' : 'duration-0');

	function trackContentHeight(node: HTMLElement) {
		if (!animateHeight) return;
		const grip = handle;
		const update = () => {
			panelHeight = Math.ceil(node.offsetHeight + (grip?.offsetHeight ?? 0));
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		if (grip) observer.observe(grip);
		return () => observer.disconnect();
	}

	// Ki/becsukás animációval, késleltetett lecsatolással
	$effect(() => {
		if (open) {
			const gen = ++generation;
			animOn = motionOK();
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
			}, outMs + 30);
			return () => clearTimeout(t);
		}
	});

	// Háttér-görgetés zár (referencia-számlált: egymásra nyíló
	// rétegek nem oldják fel egymás alól).
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
		if (e.key === 'Escape') beginClose();
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
		if (dy <= 0) {
			dragY = 0;
			return;
		}
		dragY = dy;
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
		if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
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

<svelte:window onkeydown={render ? onKey : undefined} />

{#if render}
	<div class="fixed inset-0 z-[70]" role="presentation">
		<button
			type="button"
			tabindex="-1"
			aria-label="Bezárás"
			onclick={beginClose}
			class={[
				'absolute inset-0 bg-ink-900/45 transition-opacity dark:bg-black/60',
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
				aria-label={label}
				class={[
					'pointer-events-auto relative flex max-h-[92dvh] w-full flex-col bg-white shadow-2xl transition-all outline-none dark:bg-stone-900',
					wide ? 'sm:max-w-xl' : 'sm:max-w-md',
					'rounded-t-(--radius-sheet) sm:rounded-(--radius-sheet)',
					anim,
					shown
						? 'translate-y-0 opacity-100 sm:scale-100'
						: 'translate-y-full opacity-100 sm:translate-y-10 sm:scale-[0.98] sm:opacity-0'
				]}
				style:height={animateHeight && panelHeight !== undefined ? `${panelHeight}px` : undefined}
				style={dragging && dragY > 0
					? `transform: translateY(${dragY}px); transition: none;`
					: undefined}
			>
				{#if !title && !header}
					<button
						type="button"
						onclick={beginClose}
						aria-label="Bezárás"
						class="absolute top-3 right-3 z-10 hidden size-8 place-items-center rounded-full text-stone-400 transition duration-300 hover:rotate-90 hover:bg-stone-100 hover:text-ink-900 active:scale-95 motion-reduce:transition-none motion-reduce:hover:rotate-0 sm:grid dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white"
					>
						<X size={18} />
					</button>
				{/if}
				<div
					bind:this={handle}
					class="shrink-0 cursor-grab touch-none pt-3 pb-1 select-none active:cursor-grabbing sm:hidden"
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
					role="presentation"
					ontouchstart={contentTouchStart}
					ontouchend={contentTouchEnd}
					class={['min-h-0 overflow-y-auto overscroll-contain', animateHeight && 'overflow-x-hidden [scrollbar-gutter:stable]']}
				>
					<div {@attach trackContentHeight} class="px-5 pt-2 pb-5 sm:px-6 sm:pb-6">
						{#if title || header}
							<div class={['flex items-center gap-2', animateHeight && 'min-h-9']}>
								{#if onBack}
									<button
										type="button"
										onclick={onBack}
										aria-label="Vissza"
										class="grid size-9 shrink-0 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-ink-900 active:scale-95 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-white"
									>
										<ArrowLeft size={19} />
									</button>
								{/if}
								{#if header}
									{@render header()}
								{:else}
									<h2 class="font-display min-w-0 flex-1 text-[20px] leading-snug font-extrabold tracking-tight text-ink-900 dark:text-white">
										{title}
									</h2>
								{/if}
								{#if onEdit}
									<button
										type="button"
										onclick={onEdit}
										aria-label={editLabel}
										title={editLabel}
										class="grid size-9 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-ink-900 active:scale-95 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white"
									>
										<Pencil size={18} />
									</button>
								{/if}
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
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
