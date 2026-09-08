<script lang="ts">
	import { browser } from '$app/environment';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		label: string;
		onClose: () => void;
		children: Snippet;
	}

	let { open, label, onClose, children }: Props = $props();

	let panel: HTMLElement | null = $state(null);
	let render = $state(false);
	let shown = $state(false);
	let dragging = $state(false);
	let dragY = $state(0);
	let startY = 0;

	const CLOSE_AT = 110;
	const reduced = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const OUT_MS = reduced ? 0 : 230;
	const anim = reduced
		? 'duration-0'
		: 'duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]';

	// Ki/becsukás animációval, késleltetett lecsatolással
	$effect(() => {
		if (open) {
			render = true;
			const raf = requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					shown = true;
					panel?.focus({ preventScroll: true });
				})
			);
			return () => cancelAnimationFrame(raf);
		} else {
			shown = false;
			const t = setTimeout(() => {
				render = false;
			}, OUT_MS + 30);
			return () => clearTimeout(t);
		}
	});

	// Háttér-görgetés zár
	$effect(() => {
		if (!browser || !render) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});

	function beginClose() {
		if (!render) {
			onClose();
			return;
		}
		dragging = false;
		dragY = 0;
		shown = false;
		setTimeout(onClose, OUT_MS);
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
				reduced ? 'duration-0' : 'duration-200',
				shown ? 'opacity-100' : 'opacity-0'
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
					'pointer-events-auto flex max-h-[92dvh] w-full flex-col bg-white shadow-2xl transition-all outline-none sm:max-w-md dark:bg-stone-900',
					'rounded-t-[28px] sm:rounded-[28px]',
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
					class="shrink-0 cursor-grab touch-none pt-3 pb-1 select-none active:cursor-grabbing"
					role="presentation"
					onpointerdown={handleDown}
					onpointermove={handleMove}
					onpointerup={handleUp}
					onpointercancel={handleUp}
				>
					<div class="mx-auto h-1.5 w-11 rounded-full bg-stone-200 dark:bg-white/15"></div>
				</div>
				<div class="min-h-0 overflow-y-auto overscroll-contain">
					{@render children()}
				</div>
			</div>
		</div>
	</div>
{/if}
