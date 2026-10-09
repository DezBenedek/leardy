/** A felnyíló panel a billentyűzet fölötti látható területhez igazodik. */
export function fitOverlayViewport(node: HTMLElement) {
	const viewport = window.visualViewport;
	if (!viewport) return;
	let frame = 0;
	const update = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			node.style.top = `${viewport.offsetTop}px`;
			node.style.height = `${viewport.height}px`;
			node.style.bottom = 'auto';
			const keyboardOpen = window.innerHeight - viewport.height > 120;
			node.dataset.keyboard = String(keyboardOpen);
			const field = document.activeElement;
			if (!keyboardOpen || !(field instanceof HTMLElement) || !node.contains(field)) return;
			const scroller = field.closest<HTMLElement>('[data-overlay-scroller]');
			if (!scroller) return;
			const bounds = scroller.getBoundingClientRect();
			const rect = field.getBoundingClientRect();
			// A mező alatt maradjon hely az első találatoknak is.
			const target = bounds.top + Math.min(48, bounds.height * 0.15);
			scroller.scrollTop += rect.top - target;
		});
	};
	viewport.addEventListener('resize', update);
	viewport.addEventListener('scroll', update);
	node.addEventListener('focusin', update);
	update();
	return () => {
		cancelAnimationFrame(frame);
		viewport.removeEventListener('resize', update);
		viewport.removeEventListener('scroll', update);
		node.removeEventListener('focusin', update);
	};
}
