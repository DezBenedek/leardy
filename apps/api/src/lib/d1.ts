const D1_MAX_PARAMS = 90;

export async function insertInChunks<T>(
	rows: T[],
	columnsPerRow: number,
	insert: (chunk: T[]) => Promise<unknown>,
) {
	const size = Math.max(1, Math.floor(D1_MAX_PARAMS / Math.max(columnsPerRow, 1)));
	for (let i = 0; i < rows.length; i += size) {
		await insert(rows.slice(i, i + size));
	}
}
