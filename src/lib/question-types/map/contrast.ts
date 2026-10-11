export interface ImagePixels {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

/** Az átlátszó képrészek a vászon világos hátterét kapják. */
function pixelLuminance(pixels: ImagePixels, x: number, y: number): number {
	const column = Math.max(0, Math.min(pixels.width - 1, Math.round(x * (pixels.width - 1))));
	const row = Math.max(0, Math.min(pixels.height - 1, Math.round(y * (pixels.height - 1))));
	const offset = (row * pixels.width + column) * 4;
	const alpha = pixels.data[offset + 3] / 255;
	const channels = [0, 1, 2].map((channel) => {
		const value = (pixels.data[offset + channel] * alpha + 255 * (1 - alpha)) / 255;
		return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
	});
	return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

export function contrastColor(pixels: ImagePixels, x: number, y: number): '#000' | '#fff' {
	return pixelLuminance(pixels, x, y) > .179 ? '#000' : '#fff';
}

/** Egyszínű nyíl: a kezdőpont erős kontrasztigénye, egyébként a többségi háttér dönt. */
export function arrowContrast(pixels: ImagePixels | null, start: { x: number; y: number }, end: { x: number; y: number }, width: number, height: number): '#000' | '#fff' {
	if (!pixels) return '#000';
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.hypot(dx, dy);
	const sample = (offset: number, side = 0) => pixelLuminance(pixels,
		(start.x + dx * offset - dy / (length || 1) * side) / Math.max(1, width),
		(start.y + dy * offset + dx / (length || 1) * side) / Math.max(1, height));
	const startSpan = length ? Math.min(12 / length, .1) : 0;
	let startLight = 0;
	for (let index = 0; index < 5; index++) {
		for (const side of [-2, 0, 2]) startLight += sample(startSpan * index / 4, side);
	}
	startLight /= 15;
	if (startLight <= .06) return '#fff';
	if (startLight >= .8) return '#000';
	const steps = Math.max(1, Math.min(256, Math.ceil(length / 3)));
	let white = 0;
	for (let index = 0; index <= steps; index++) {
		if (sample(index / steps) <= .179) white++;
	}
	if (white * 2 === steps + 1) return startLight > .179 ? '#000' : '#fff';
	return white * 2 > steps + 1 ? '#fff' : '#000';
}

export function readImagePixels(image: HTMLImageElement): ImagePixels | null {
	try {
		const canvas = document.createElement('canvas');
		const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
		canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
		canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		return context.getImageData(0, 0, canvas.width, canvas.height);
	} catch {
		// Képpontolvasást tiltó külső képnél az alapértelmezett egyszínű nyíl marad.
		return null;
	}
}
