-- Kártyacsomag típusa: Szókártya (word) vagy Tanulókártya (study).
-- Idempotens kiegészítés: ha az oszlop már létezik, a futtató hagyja figyelmen kívül a hibát.
ALTER TABLE decks ADD COLUMN card_kind TEXT NOT NULL DEFAULT 'word';
ALTER TABLE lesson_card_packs ADD COLUMN card_kind TEXT NOT NULL DEFAULT 'word';
