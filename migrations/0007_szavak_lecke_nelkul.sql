-- Szókártya-hordozó leckék szövegének kiürítése: ezekhez nem kell leckeoldal,
-- csak a kártyák. Üres szöveggel és kvíz nélkül a fa, a számlálók és a
-- részletező lecke-linkjei automatikusan elrejtik őket.
-- Idempotens, újrafuttatható.

PRAGMA foreign_keys=OFF;

UPDATE lessons SET body_md = '' WHERE id IN (
	'lesson-angol-a1-koszones', 'lesson-angol-a1-csalad',
	'lesson-angol-a1-etel', 'lesson-angol-a1-szamok',
	'lesson-angol-a2-otthon', 'lesson-angol-a2-utazas',
	'lesson-angol-a2-vasarlas', 'lesson-angol-a2-idojaras',
	'lesson-angol-b1-munka', 'lesson-angol-b1-egeszseg',
	'lesson-angol-b1-tech', 'lesson-angol-b1-velemeny',
	'lesson-nemet-a1-begruesung', 'lesson-nemet-a1-familie',
	'lesson-nemet-a1-essen', 'lesson-nemet-a1-zahlen',
	'lesson-nemet-a2-wohnen', 'lesson-nemet-a2-reisen',
	'lesson-nemet-a2-einkaufen', 'lesson-nemet-a2-wetter',
	'lesson-nemet-b1-arbeit', 'lesson-nemet-b1-gesundheit',
	'lesson-nemet-b1-tech', 'lesson-nemet-b1-meinung'
);
