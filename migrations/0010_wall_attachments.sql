-- Fal-csatolmányok + elvárások: üzenet hivatkozhat kártyacsomagra és kvízre is,
-- kiosztáshoz minimum pont (elvárás %) tartozhat.
ALTER TABLE assignments ADD COLUMN min_score INTEGER NOT NULL DEFAULT 0;
