/* Kártyasorok takarítása a csomagszerkesztőben.
   Ha egy sor mindkét oldala kiürül, a sor kikerül a listából.
   A végén pontosan egy üres sor marad az új kártyának. */

export interface PrunableRow {
	key: number;
	id: string | null;
	front: string;
	back: string;
}

function isEmptyRow(row: Pick<PrunableRow, 'front' | 'back'>): boolean {
	return row.front.trim() === '' && row.back.trim() === '';
}

/** Üres sorok eltávolítása: a közbülső üres sorok kikerülnek,
    a végi üres futamból csak az utolsó marad meg.
    Az exemptKey sor soha nem törlődik: amelyik sor éppen fókuszt kap,
    azt a takarítás megkíméli.
    Visszaadja a megtartott sorokat és a törlendő mentett azonosítókat. */
export function pruneEmptyRows<T extends PrunableRow>(rows: T[], exemptKey: number | null = null): {
	kept: T[];
	removedIds: string[];
	changed: boolean;
} {
	const removedIds: string[] = [];
	const kept: T[] = [];
	const last = rows.length - 1;
	let changed = false;
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (!isEmptyRow(row) || i === last || row.key === exemptKey) {
			kept.push(row);
			continue;
		}
		changed = true;
		if (row.id) removedIds.push(row.id);
	}
	return { kept, removedIds, changed };
}
