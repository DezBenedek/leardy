-- Publikált saját kártyacsomagok: a tanár közzéteheti a csomagját,
-- ilyenkor az a Felfedezésben és a csatolt leckénél mindenkinek látszik.
-- Nem publikált csomag továbbra is csak a tulajdonosé.
ALTER TABLE decks ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_decks_public ON decks(is_public);
