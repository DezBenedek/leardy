interface DismissGestureOptions {
	canDismiss: () => boolean;
	onDrag: (distance: number, active: boolean) => void;
	onDismiss: () => void;
}

/** A lista tetején a görgetés folyamatosan átadja a mozdulatot a panelnek. */
export function attachDismissGesture(panel: HTMLElement, options: DismissGestureOptions): () => void {
	let touchId: number | null = null;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let lastY = 0;
	let lastTime = 0;
	let velocity = 0;
	let distance = 0;
	let height = 0;
	let active = false;
	let vertical = false;
	let grip = false;
	let scrollables: HTMLElement[] = [];
	let suppressClickUntil = 0;
	const slop = 6;

	function reset() {
		touchId = null;
		pointerId = null;
		active = false;
		distance = 0;
		options.onDrag(0, false);
	}

	function start(target: EventTarget | null, x: number, y: number, fromGrip = false): boolean {
		if (!window.matchMedia('(max-width: 639px)').matches || !options.canDismiss() || !(target instanceof Element)) return false;
		if (!fromGrip && target.closest('input, textarea, select, [contenteditable="true"], [data-scrollable-text]')) return false;
		startX = x;
		startY = lastY = y;
		lastTime = performance.now();
		velocity = distance = 0;
		active = vertical = false;
		grip = fromGrip;
		height = panel.getBoundingClientRect().height;
		scrollables = [];
		if (!grip) {
			for (let node: Element | null = target; node && node !== panel; node = node.parentElement) {
				if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)) scrollables.push(node);
			}
		}
		return true;
	}

	function move(event: Event, x: number, y: number) {
		if (!options.canDismiss()) { reset(); return; }
		const now = performance.now();
		const step = y - lastY;
		const elapsed = Math.max(now - lastTime, 1);
		lastY = y;
		lastTime = now;
		if (!vertical) {
			if (Math.max(Math.abs(x - startX), Math.abs(y - startY)) < slop) return;
			if (!grip && Math.abs(x - startX) > Math.abs(y - startY)) { reset(); return; }
			vertical = true;
		}
		velocity = velocity * 0.35 + (step / elapsed) * 0.65;
		if (!active) {
			if (step <= 0) return;
			const remainingScroll = scrollables.reduce((sum, node) => sum + Math.max(0, node.scrollTop), 0);
			if (remainingScroll >= step) return;
			// A még hátralévő görgetést előbb elfogyasztjuk, így nincs ugrás a határon.
			for (const node of scrollables) node.scrollTop = 0;
			distance = Math.max(0, step - remainingScroll - (Math.abs(y - startY) === Math.abs(step) ? slop : 0));
			active = true;
		} else distance = Math.max(0, distance + step);
		if (event.cancelable) event.preventDefault();
		suppressClickUntil = now + 400;
		if (distance === 0 && step < 0) {
			active = false;
			options.onDrag(0, false);
			return;
		}
		// Hosszú lehúzásnál enyhe ellenállás fogja meg a panelt.
		const resistanceAt = Math.max(120, height * 0.55);
		const offset = distance <= resistanceAt ? distance : resistanceAt + (distance - resistanceAt) * 0.6;
		options.onDrag(offset, true);
	}

	function finish(cancelled = false) {
		const idle = performance.now() - lastTime;
		const releaseVelocity = idle > 100 ? 0 : velocity;
		const closeAt = Math.min(140, Math.max(72, height * 0.22));
		const dismiss = !cancelled && active && options.canDismiss() &&
			((distance >= closeAt && releaseVelocity > -0.3) || (distance >= 36 && releaseVelocity > 0.65));
		reset();
		if (dismiss) options.onDismiss();
	}

	function touchStart(event: TouchEvent) {
		if (event.touches.length !== 1) { finish(true); return; }
		const touch = event.changedTouches[0];
		if (!touch) return;
		const fromGrip = event.target instanceof Element && !!event.target.closest('[data-overlay-handle]');
		if (start(event.target, touch.clientX, touch.clientY, fromGrip)) touchId = touch.identifier;
	}
	function touchMove(event: TouchEvent) {
		if (touchId === null) return;
		if (event.touches.length !== 1) { finish(true); return; }
		const touch = [...event.touches].find((item) => item.identifier === touchId);
		if (touch) move(event, touch.clientX, touch.clientY);
	}
	function touchEnd(event: TouchEvent) {
		if (touchId !== null && [...event.changedTouches].some((touch) => touch.identifier === touchId)) finish();
	}
	function touchCancel() { if (touchId !== null) finish(true); }
	function pointerDown(event: PointerEvent) {
		if (event.pointerType === 'touch' || event.button !== 0 || !(event.target instanceof Element) || !event.target.closest('[data-overlay-handle]')) return;
		if (!start(event.target, event.clientX, event.clientY, true)) return;
		pointerId = event.pointerId;
		panel.setPointerCapture(event.pointerId);
		event.preventDefault();
	}
	function pointerMove(event: PointerEvent) { if (event.pointerId === pointerId) move(event, event.clientX, event.clientY); }
	function pointerUp(event: PointerEvent) { if (event.pointerId === pointerId) finish(); }
	function pointerCancel(event: PointerEvent) { if (event.pointerId === pointerId) finish(true); }
	function click(event: MouseEvent) {
		if (performance.now() >= suppressClickUntil || event.detail === 0) return;
		event.preventDefault();
		event.stopPropagation();
	}

	panel.addEventListener('touchstart', touchStart, { passive: true });
	panel.addEventListener('touchmove', touchMove, { passive: false });
	panel.addEventListener('touchend', touchEnd);
	panel.addEventListener('touchcancel', touchCancel);
	panel.addEventListener('pointerdown', pointerDown);
	panel.addEventListener('pointermove', pointerMove);
	panel.addEventListener('pointerup', pointerUp);
	panel.addEventListener('pointercancel', pointerCancel);
	panel.addEventListener('click', click, true);
	return () => {
		panel.removeEventListener('touchstart', touchStart);
		panel.removeEventListener('touchmove', touchMove);
		panel.removeEventListener('touchend', touchEnd);
		panel.removeEventListener('touchcancel', touchCancel);
		panel.removeEventListener('pointerdown', pointerDown);
		panel.removeEventListener('pointermove', pointerMove);
		panel.removeEventListener('pointerup', pointerUp);
		panel.removeEventListener('pointercancel', pointerCancel);
		panel.removeEventListener('click', click, true);
	};
}
