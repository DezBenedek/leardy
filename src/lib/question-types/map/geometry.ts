/** A nyíl a képpontból a válaszmező legközelebbi széléig tart. */
export function boxArrowEnd(box: { x: number; y: number; width: number; arrow?: { x: number; y: number } }, width: number, height: number) {
	const x = box.x * width / 100;
	const y = box.y * height / 100;
	const origin = box.arrow ?? box;
	const dx = origin.x * width / 100 - x;
	const dy = origin.y * height / 100 - y;
	const scale = Math.max(Math.abs(dx) / (box.width * width / 200), Math.abs(dy) / 22);
	return scale > 1 ? { x: x + dx / scale, y: y + dy / scale } : { x, y };
}
