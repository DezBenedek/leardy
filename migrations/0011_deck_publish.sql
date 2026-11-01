-- Publikált saját kártyacsomagok: a tanár közzéteheti a csomagját,
-- ilyenkor az a Felfedezésben és a csatolt leckénél mindenkinek látszik.
-- Nem publikált csomag továbbra is csak a tulajdonosé.
-- Az is_public oszlop a 0001 init része (friss adatbázisokon onnan jön),
-- itt már csak az index készül. A futó kód önhelyreállító ensure-ja
-- a kettő közötti átmeneti állapotot is lefedi.
CREATE INDEX IF NOT EXISTS idx_decks_public ON decks(is_public);
