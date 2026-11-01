-- school_id visszamenőleges feltöltése e-mail domain alapján.
-- Minden fiókhoz tartozik iskola azonosító: az e-mail cím kukac utáni része.
-- Idempotens: csak az üres mezőket írja át.

UPDATE users
SET school_id = lower(substr(email, instr(email, '@') + 1))
WHERE (school_id IS NULL OR school_id = '') AND instr(email, '@') > 0;
