export interface ImagePixels {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

/** Az átlátszó képrészek a vászon világos hátterét kapják. */
export function contrastColor(pixels: ImagePixels, x: number, y: number): '#000' | '#fff' {
	const column = Math.max(0, Math.min(pixels.width - 1, Math.round(x * (pixels.width - 1))));
	const row = Math.max(0, Math.min(pixels.height - 1, Math.round(y * (pixels.height - 1))));
	const offset = (row * pixels.width + column) * 4;
	const alpha = pixels.data[offset + 3] / 255;
	const channels = [0, 1, 2].map((channel) => {
		const value = (pixels.data[offset + channel] * alpha + 255 * (1 - alpha)) / 255;
		return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
	});
	const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
	return luminance > .179 ? '#000' : '#fff';
}

/** A nyíl mentén a világos és sötét képrészek külön színt kapnak. */
export function arrowContrast(pixels: ImagePixels | null, start: { x: number; y: number }, end: { x: number; y: number }, width: number, height: number) {
	if (!pixels) return [{ offset: 0, color: '#fff' }, { offset: 1, color: '#fff' }];
	const steps = Math.max(1, Math.min(256, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 3)));
	const stops: { offset: number; color: string }[] = [];
	for (let index = 0; index <= steps; index++) {
		const offset = index / steps;
		const color = contrastColor(pixels, (start.x + (end.x - start.x) * offset) / width, (start.y + (end.y - start.y) * offset) / height);
		if (stops.length && stops.at(-1)!.color !== color) stops.push({ offset, color: stops.at(-1)!.color });
		if (!stops.length || stops.at(-1)!.color !== color || index === steps) stops.push({ offset, color });
	}
	return stops;
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
		// Külső, képpontolvasást tiltó képnél a böngésző kontrasztkeverése működik.
		return null;
	}
}
