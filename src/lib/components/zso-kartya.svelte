<script lang="ts">
	import { Card } from '$lib/components/ui/card/index.js';

	/**
	 * Húzható tanulókártya a régi ZsoKartya alapján:
	 * koppintásra fordul, jobbra húzva "tudom" (zöld),
	 * balra húzva "nem tudom" (piros). Küszöb: szélesség 20%-a.
	 */
	interface Props {
		front: string;
		back: string;
		stamp: string;
		frontHint?: string | null;
		backHint?: string | null;
		canFlip?: boolean;
		showBack?: boolean;
		onFlipped?: ((back: boolean) => void) | null;
		onKnow?: (() => void) | null;
		onDontKnow?: (() => void) | null;
	}

	let {
		front,
		back,
		stamp,
		frontHint = null,
		backHint = null,
		canFlip = true,
		showBack = $bindable(false),
		onFlipped = null,
		onKnow = null,
		onDontKnow = null
	}: Props = $props();

	const canSwipe = $derived(onKnow !== null || onDontKnow !== null);

	let el: HTMLDivElement | null = null;
	let drag = $state(0);
	let dragging = $state(false);
	let flying = $state<0 | 1 | -1>(0);
	let startX = 0;
	let startY = 0;
	let downT = 0;
	let moved = 0;
	let lastX = 0;
	let lastT = 0;
	let velocity = 0;

	function width(): number {
		return el?.offsetWidth ?? 320;
	}

	function onPointerDown(e: PointerEvent) {
		if (flying !== 0) return;
		startX = e.clientX;
		startY = e.clientY;
		lastX = e.clientX;
		lastT = performance.now();
		downT = lastT;
		moved = 0;
		velocity = 0;
		dragging = true;
		(el as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || flying !== 0) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
		const now = performance.now();
		if (now > lastT) {
			velocity = (e.clientX - lastX) / ((now - lastT) / 1000);
			lastX = e.clientX;
			lastT = now;
		}
		if (canSwipe) drag = dx;
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging || flying !== 0) return;
		dragging = false;
		const w = width();
		const threshold = w * 0.2;
		const goRight = onKnow !== null && (drag > threshold || (velocity > 850 && drag > 20));
		const goLeft = onDontKnow !== null && (drag < -threshold || (velocity < -850 && drag < -20));

		if (canSwipe && (goRight || goLeft)) {
			flying = goRight ? 1 : -1;
			drag = flying * (w + 120);
			setTimeout(() => {
				if (goRight) onKnow?.();
				else onDontKnow?.();
			}, 300);
			return;
		}
		// tap = fordítás
		if (moved < 10 && performance.now() - downT < 500 && canFlip) {
			showBack = !showBack;
			onFlipped?.(showBack);
		}
		drag = 0;
	}

	function onPointerCancel() {
		dragging = false;
		drag = 0;
	}

	const progress = $derived(Math.min(1, Math.max(-1, drag / 90)));
	const overlayColor = $derived(progress > 0 ? 'var(--forest)' : 'var(--wine)');
</script>

<div
	bind:this={el}
	role="button"
	tabindex={0}
	aria-label="{stamp}: {showBack ? back : front}"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerCancel}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (canFlip) {
				showBack = !showBack;
				onFlipped?.(showBack);
			}
		}
		if (e.key === 'ArrowRight') onKnow?.();
		if (e.key === 'ArrowLeft') onDontKnow?.();
	}}
	class="zso-touch w-full cursor-grab outline-none active:cursor-grabbing"
	style="transform: translateX({drag}px) rotate({drag * 0.04}deg); {dragging
		? ''
		: flying !== 0
			? 'transition: transform 0.3s cubic-bezier(0.3, 0.7, 0.4, 1);'
			: 'transition: transform 0.5s cubic-bezier(0.3, 1.35, 0.4, 1);'}"
>
	<div class="relative">
		<div class="flip-inner h-72 sm:h-80" class:flipped={showBack}>
			<div class="flip-face">
				<Card class="flex h-full flex-col px-6 py-5">
					<p class="text-muted-foreground text-xs font-semibold tracking-wide">{stamp}</p>
					<div class="flex flex-1 items-center justify-center overflow-hidden">
						<p class="font-display text-center text-[28px] leading-[1.2] font-bold tracking-tight text-balance">{front}</p>
					</div>
					<p class="text-muted-foreground min-h-4 text-center text-xs font-medium">{canFlip ? (frontHint ?? '') : ''}</p>
				</Card>
			</div>
			<div class="flip-face flip-back">
				<Card class="flex h-full flex-col px-6 py-5">
					<p class="text-muted-foreground text-xs font-semibold tracking-wide">{stamp}</p>
					<div class="flex flex-1 items-center justify-center overflow-hidden">
						<p class="font-display text-center text-[28px] leading-[1.2] font-bold tracking-tight text-balance">{back}</p>
					</div>
					<p class="text-muted-foreground min-h-4 text-center text-xs font-medium">{canFlip ? (backHint ?? '') : ''}</p>
				</Card>
			</div>
		</div>
		{#if Math.abs(progress) > 0.12}
			<div
				class="pointer-events-none absolute inset-0 rounded-[18px]"
				style="background: color-mix(in srgb, {overlayColor} {Math.round(Math.abs(progress) * 22)}%, transparent)"
			></div>
		{/if}
	</div>
</div>
