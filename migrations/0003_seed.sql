-- Demo seed: 1 nyelvi + 1 tantárgyi témakör, leckékkel, kártyákkal, kvízekkel.
-- INSERT OR IGNORE: újrafuttatható, nem duplikál.

INSERT OR IGNORE INTO topics (id, title, category, type, is_public, author_id, created_at) VALUES
	('t-en-travel', 'Unit 3: Utazás', 'Nyelv', 'language', 1, NULL, 1700000000000),
	('t-mohacs', 'Mohácsi csata', 'Humán', 'general', 1, NULL, 1700000000000);

INSERT OR IGNORE INTO lessons (id, topic_id, order_index, title, description_markdown, created_at) VALUES
	('l-airport', 't-en-travel', 0, 'Repülőtéren',
		'# Repülőtéren' || char(10) || char(10) ||
		'**Cél:** eligazodás a reptéren angolul.' || char(10) || char(10) ||
		'- Check-in: *I would like to check in.*' || char(10) ||
		'- Boarding pass: beszállókártya' || char(10) ||
		'- Gate: kapu — figyeld a kijelzőt!' || char(10) || char(10) ||
		'> Tipp: a *delayed* azt jelenti: késik.', 1700000000000),
	('l-hotel', 't-en-travel', 1, 'Szállás',
		'# Szállás' || char(10) || char(10) ||
		'**Cél:** szobafoglalás és problémák jelzése.' || char(10) || char(10) ||
		'- *I have a reservation.* — Foglalásom van.' || char(10) ||
		'- *Could I have…?* — Kaphatnék…?' || char(10) || char(10) ||
		'> Tipp: mindig kérj visszaigazolást e-mailben.', 1700000000000),
	('l-elozmeny', 't-mohacs', 0, 'Előzmények',
		'# Előzmények' || char(10) || char(10) ||
		'**Cél:** miért került sor a csatára 1526-ban?' || char(10) || char(10) ||
		'- Oszmán terjeszkedés a Balkánon' || char(10) ||
		'- II. Lajos fiatal kora, gyenge központi hatalom' || char(10) ||
		'- Nándorfehérvár eleste (1521)' || char(10) || char(10) ||
		'> Évszám: **1521** — Nándorfehérvár eleste.', 1700000000000),
	('l-csata', 't-mohacs', 1, 'A csata',
		'# A csata' || char(10) || char(10) ||
		'**Cél:** a mohácsi csata lefolyása és következményei.' || char(10) || char(10) ||
		'- Dátum: **1526. augusztus 29.**' || char(10) ||
		'- Magyar vezér: Tomori Pál' || char(10) ||
		'- Következmény: középkori Magyar Királyság bukása' || char(10) || char(10) ||
		'> Emlékeztető: a csatavesztés után az ország három részre szakadt.', 1700000000000);

-- Repülőtér kártyák (nyelvi: IPA-val)
INSERT OR IGNORE INTO flashcards (id, lesson_id, front_text, back_text, audio_url, image_url, ipa) VALUES
	('c-air-1', 'l-airport', 'boarding pass', 'beszállókártya', NULL, NULL, '/ˈbɔː.dɪŋ pɑːs/'),
	('c-air-2', 'l-airport', 'delayed', 'késik (járat)', NULL, NULL, '/dɪˈleɪd/'),
	('c-air-3', 'l-airport', 'gate', 'kapu (reptéren)', NULL, NULL, '/ɡeɪt/'),
	('c-air-4', 'l-airport', 'luggage', 'poggyász', NULL, NULL, '/ˈlʌɡ.ɪdʒ/'),
	('c-air-5', 'l-airport', 'to check in', 'bejelentkezni (járatra)', NULL, NULL, '/tə tʃek ɪn/');

-- Szállás kártyák
INSERT OR IGNORE INTO flashcards (id, lesson_id, front_text, back_text, audio_url, image_url, ipa) VALUES
	('c-hot-1', 'l-hotel', 'reservation', 'foglalás', NULL, NULL, '/ˌrez.əˈveɪ.ʃən/'),
	('c-hot-2', 'l-hotel', 'reception', 'recepció', NULL, NULL, '/rɪˈsep.ʃən/'),
	('c-hot-3', 'l-hotel', 'towel', 'törölköző', NULL, NULL, '/taʊəl/'),
	('c-hot-4', 'l-hotel', 'breakfast included', 'reggelivel együtt', NULL, NULL, '/ˈbrek.fəst ɪnˈkluː.dɪd/'),
	('c-hot-5', 'l-hotel', 'key card', 'mágneskártyás kulcs', NULL, NULL, '/kiː kɑːd/');

-- Előzmények kártyák (tantárgyi, mikrofon nélkül)
INSERT OR IGNORE INTO flashcards (id, lesson_id, front_text, back_text, audio_url, image_url, ipa) VALUES
	('c-pre-1', 'l-elozmeny', 'Nándorfehérvár eleste', '1521 — az oszmánok elfoglalják a végvárat', NULL, NULL, NULL),
	('c-pre-2', 'l-elozmeny', 'II. Lajos', 'magyar király a csata idején (1516–1526)', NULL, NULL, NULL),
	('c-pre-3', 'l-elozmeny', 'Szülejmán', 'oszmán szultán (I. Szulejmán)', NULL, NULL, NULL),
	('c-pre-4', 'l-elozmeny', 'Végvári rendszer', 'déli határvédelmi lánc', NULL, NULL, NULL),
	('c-pre-5', 'l-elozmeny', '1521', 'Nándorfehérvár eleste', NULL, NULL, NULL);

-- Csata kártyák
INSERT OR IGNORE INTO flashcards (id, lesson_id, front_text, back_text, audio_url, image_url, ipa) VALUES
	('c-bat-1', 'l-csata', '1526. augusztus 29.', 'a mohácsi csata napja', NULL, NULL, NULL),
	('c-bat-2', 'l-csata', 'Tomori Pál', 'a magyar sereg fővezére', NULL, NULL, NULL),
	('c-bat-3', 'l-csata', 'II. Lajos halála', 'a csatában / menekülés közben életét veszti', NULL, NULL, NULL),
	('c-bat-4', 'l-csata', 'Következmény', 'a középkori Magyar Királyság bukása', NULL, NULL, NULL),
	('c-bat-5', 'l-csata', 'Három részre szakadás', 'királyi Magyarország, hódoltság, Erdély', NULL, NULL, NULL);

-- Repülőtér kvíz
INSERT OR IGNORE INTO quiz_questions (id, lesson_id, question_text, type, options_json, correct_answer) VALUES
	('q-air-1', 'l-airport', 'Mit jelent: boarding pass?', 'choice', '["útlevél","beszállókártya","poggyászcímke","vízum"]', 'beszállókártya'),
	('q-air-2', 'l-airport', 'Mit jelent: delayed?', 'choice', '["törölve","késik","beszállás alatt","érkezik"]', 'késik'),
	('q-air-3', 'l-airport', 'Hol kell a gate számát figyelni?', 'choice', '["a poggyászszalagon","a kijelzőn","az útlevélben","a parkolóban"]', 'a kijelzőn'),
	('q-air-4', 'l-airport', 'Egészítsd ki: I would like to ___ in.', 'choice', '["check","go","take","put"]', 'check'),
	('q-air-5', 'l-airport', 'Mit viszel fel a fedélzetre? (kézipoggyász)', 'choice', '["luggage tag","cabin bag","boarding time","runway"]', 'cabin bag');

-- Szállás kvíz
INSERT OR IGNORE INTO quiz_questions (id, lesson_id, question_text, type, options_json, correct_answer) VALUES
	('q-hot-1', 'l-hotel', 'Mit jelent: reservation?', 'choice', '["foglalás","lemondás","számla","borravaló"]', 'foglalás'),
	('q-hot-2', 'l-hotel', 'Hol jelentkezel be érkezéskor?', 'choice', '["a recepción","a liftben","az étteremben","a parkolóban"]', 'a recepción'),
	('q-hot-3', 'l-hotel', 'Mit kérsz, ha nincs a szobában? ___ please.', 'choice', '["tower","towel","town","tour"]', 'towel'),
	('q-hot-4', 'l-hotel', 'Mit jelent: breakfast included?', 'choice', '["reggeli nélkül","reggelivel együtt","csak vacsora","félpanzió felárért"]', 'reggelivel együtt'),
	('q-hot-5', 'l-hotel', 'Mivel nyitod a modern szállodai szobát?', 'choice', '["kulccsal","key carddal","kóddal SMS-ben","semmivel"]', 'key carddal');

-- Előzmények kvíz (definíció + évszám-párosítás)
INSERT OR IGNORE INTO quiz_questions (id, lesson_id, question_text, type, options_json, correct_answer) VALUES
	('q-pre-1', 'l-elozmeny', 'Mikor esett el Nándorfehérvár?', 'choice', '["1516","1521","1526","1541"]', '1521'),
	('q-pre-2', 'l-elozmeny', 'Ki volt magyar király 1526-ban?', 'choice', '["I. Ferdinánd","II. Lajos","Szapolyai János","I. Miksa"]', 'II. Lajos'),
	('q-pre-3', 'l-elozmeny', 'Párosítsd az évszámot: 1521', 'match', '{"left":"1521","options":["Nándorfehérvár eleste","Mohácsi csata","Buda eleste","Nagyharsányi csata"],"answer":"Nándorfehérvár eleste"}', 'Nándorfehérvár eleste'),
	('q-pre-4', 'l-elozmeny', 'Mi volt a végvári rendszer szerepe?', 'choice', '["adózás","déli határvédelem","kereskedelem","oktatás"]', 'déli határvédelem'),
	('q-pre-5', 'l-elozmeny', 'Ki vezette az oszmán sereget 1526-ban?', 'choice', '["Szelim","Szulejmán","Mehmed","Bajazid"]', 'Szulejmán');

-- Csata kvíz
INSERT OR IGNORE INTO quiz_questions (id, lesson_id, question_text, type, options_json, correct_answer) VALUES
	('q-bat-1', 'l-csata', 'Mikor volt a mohácsi csata?', 'choice', '["1521. június 28.","1526. augusztus 29.","1541. augusztus 29.","1687. augusztus 12."]', '1526. augusztus 29.'),
	('q-bat-2', 'l-csata', 'Ki volt a magyar sereg fővezére?', 'choice', '["Zrínyi Miklós","Tomori Pál","Szapolyai János","Báthori István"]', 'Tomori Pál'),
	('q-bat-3', 'l-csata', 'Párosítsd az évszámot: 1526', 'match', '{"left":"1526","options":["Nándorfehérvár eleste","Mohácsi csata","Buda eleste","Eger ostroma"],"answer":"Mohácsi csata"}', 'Mohácsi csata'),
	('q-bat-4', 'l-csata', 'Mi lett a csata következménye?', 'choice', '["azonnali béke","a középkori Magyar Királyság bukása","oszmán kivonulás","Habsburg trónfosztás"]', 'a középkori Magyar Királyság bukása'),
	('q-bat-5', 'l-csata', 'Melyik három részre szakadt az ország?', 'choice', '["királyi Magyarország, hódoltság, Erdély","Felvidék, Dunántúl, Alföld","Horvátország, Bosznia, Szerbia","Bécs, Buda, Pozsony"]', 'királyi Magyarország, hódoltság, Erdély');
