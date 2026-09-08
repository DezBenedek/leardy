-- Kategóriarendszer: tantárgyak (Angol, Német, Olasz, Matek, Irodalom, Nyelvtan, Történelem).
UPDATE topics SET category = 'Angol' WHERE category = 'Nyelv';
UPDATE topics SET category = 'Történelem' WHERE category = 'Humán';
