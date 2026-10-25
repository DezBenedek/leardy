/** Billentyűzetnél elrejtjük az alsó navigációt, és elhagyjuk a rendszer alsó térközét. */
export function startAppViewport(): () => void {
	const root = document.documentElement;
	const viewport = window.visualViewport;
	let fullHeight = window.innerHeight;
	let fullWidth = window.innerWidth;
	let frame = 0;
	function update() {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			const field = document.activeElement;
			const editing = field instanceof HTMLElement &&
				(field.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), textarea') || field.isContentEditable);
			if (Math.abs(window.innerWidth - fullWidth) > 100) {
				fullWidth = window.innerWidth;
				fullHeight = window.innerHeight;
			}
			if (!editing) fullHeight = window.innerHeight;
			else fullHeight = Math.max(fullHeight, window.innerHeight);
			const visibleHeight = viewport ? viewport.height * viewport.scale : window.innerHeight;
			root.dataset.keyboardOpen = String(editing && fullHeight - visibleHeight > 120);
		});
	}
	window.addEventListener('resize', update);
	viewport?.addEventListener('resize', update);
	document.addEventListener('focusin', update);
	document.addEventListener('focusout', update);
	update();
	return () => {
		cancelAnimationFrame(frame);
		window.removeEventListener('resize', update);
		viewport?.removeEventListener('resize', update);
		document.removeEventListener('focusin', update);
		document.removeEventListener('focusout', update);
		delete root.dataset.keyboardOpen;
	};
}
