-- Új kvíz-játéktípusokhoz seed: igaz/hamis + sorrendbe rakós.
INSERT OR IGNORE INTO quiz_questions (id, lesson_id, question_text, type, options_json, correct_answer) VALUES
	('q2-air-1', 'l-airport', 'A beszállókártyát (boarding pass) a kapunál kell felmutatni.', 'tf', '["Igaz","Hamis"]', 'Igaz'),
	('q2-air-2', 'l-airport', 'Rakd sorrendbe a reptéri lépéseket!', 'order', '["Check-in","Biztonsági ellenőrzés","Beszállás"]', ''),
	('q2-hot-1', 'l-hotel', 'A „breakfast included" azt jelenti, hogy a reggeli nincs benne az árban.', 'tf', '["Igaz","Hamis"]', 'Hamis'),
	('q2-pre-1', 'l-elozmeny', 'Nándorfehérvár 1521-ben esett el.', 'tf', '["Igaz","Hamis"]', 'Igaz'),
	('q2-bat-1', 'l-csata', 'Rakd időrendi sorrendbe!', 'order', '["Nándorfehérvár eleste (1521)","Mohácsi csata (1526)","Buda eleste (1541)"]', ''),
	('q2-bat-2', 'l-csata', 'Tomori Pál az oszmán sereget vezette.', 'tf', '["Igaz","Hamis"]', 'Hamis');
