-- Leardy adatbázis: az EGYETLEN séma + demo fájl.
-- A 28 széttagolt migráció (köztük 6 hatástalanított legacy) ebbe az egy
-- fájlba lett sűrítve (v0.0.1-beta rendrakás).
-- Minden utasítás idempotens (IF NOT EXISTS, OR IGNORE), ezért friss és
-- már migrált adatbázison is biztonságosan futtatható.
-- A futásidőbeli ensure-függvények (db.ts, curriculum.ts, classroom.ts)
-- ugyanezt a sémát hozzák létre, azok változatlanul megmaradtak.

PRAGMA foreign_keys=OFF;

-- Auth -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE,
	pass_hash TEXT NOT NULL,
	salt TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	role TEXT NOT NULL DEFAULT 'student',
	xp INTEGER NOT NULL DEFAULT 0,
	streak INTEGER NOT NULL DEFAULT 0,
	last_study_date TEXT NOT NULL DEFAULT '',
	is_admin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
	token TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Tanterv: Tantárgy → Szint → Tananyag → Lecke + szekció-kvízek ---------------
CREATE TABLE IF NOT EXISTS subjects (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	icon TEXT NOT NULL DEFAULT 'book',
	level_label TEXT NOT NULL DEFAULT 'Szint',
	sort INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS levels (
	id TEXT PRIMARY KEY,
	subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS materials (
	id TEXT PRIMARY KEY,
	level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
	id TEXT PRIMARY KEY,
	material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	body_md TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quizzes (
	id TEXT PRIMARY KEY,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	section_slug TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL,
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_questions (
	id TEXT PRIMARY KEY,
	quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
	question_text TEXT NOT NULL,
	type TEXT NOT NULL DEFAULT 'choice',
	options_json TEXT NOT NULL DEFAULT '[]',
	correct_answer TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lesson_progress (
	user_id INTEGER NOT NULL,
	lesson_id TEXT NOT NULL,
	done INTEGER NOT NULL DEFAULT 0,
	score INTEGER,
	total INTEGER,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_levels_subject ON levels(subject_id, sort);
CREATE INDEX IF NOT EXISTS idx_materials_level ON materials(level_id, sort);
CREATE INDEX IF NOT EXISTS idx_lessons_material ON lessons(material_id, sort);
CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON quizzes(lesson_id, sort);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, sort);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id);

-- Hivatalos kártyák és csomagok ------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_cards (
	id TEXT PRIMARY KEY,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	section_slug TEXT NOT NULL DEFAULT '',
	front TEXT NOT NULL DEFAULT '',
	back TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0,
	pack_id TEXT
);

CREATE TABLE IF NOT EXISTS lesson_card_packs (
	id TEXT PRIMARY KEY,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lesson_cards_lesson ON lesson_cards(lesson_id, sort);
CREATE INDEX IF NOT EXISTS idx_lesson_card_packs_lesson ON lesson_card_packs(lesson_id, sort);
CREATE INDEX IF NOT EXISTS idx_lesson_cards_pack ON lesson_cards(pack_id, sort);

-- Saját csomagok, kártya-haladás, könyvtár --------------------------------------
CREATE TABLE IF NOT EXISTS decks (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	kind TEXT NOT NULL DEFAULT 'cards',
	subject_id TEXT,
	level_id TEXT,
	material_id TEXT,
	lesson_id TEXT,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deck_cards (
	id TEXT PRIMARY KEY,
	deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
	front TEXT NOT NULL DEFAULT '',
	back TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0,
	section_slug TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS card_progress (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	card_key TEXT NOT NULL,
	known INTEGER NOT NULL DEFAULT 0,
	seen INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL DEFAULT '',
	PRIMARY KEY (user_id, card_key)
);

CREATE TABLE IF NOT EXISTS library (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	quiz_id TEXT NOT NULL,
	added_at INTEGER NOT NULL,
	PRIMARY KEY (user_id, quiz_id)
);

CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id, sort);
CREATE INDEX IF NOT EXISTS idx_card_progress_user ON card_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_library_user ON library(user_id);

-- Tanterem: osztályok, üzenetek, feladatok --------------------------------------
CREATE TABLE IF NOT EXISTS classrooms (
	id TEXT PRIMARY KEY,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	subject TEXT NOT NULL DEFAULT '',
	description TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_members (
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	joined_at INTEGER NOT NULL,
	PRIMARY KEY (classroom_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
	id TEXT PRIMARY KEY,
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	body TEXT NOT NULL DEFAULT '',
	link_url TEXT,
	ref_type TEXT,
	ref_id TEXT,
	ref_title TEXT,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_tasks (
	id TEXT PRIMARY KEY,
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL DEFAULT '',
	lesson_ids_json TEXT NOT NULL DEFAULT '[]',
	question_count INTEGER NOT NULL DEFAULT 10,
	target_pct INTEGER NOT NULL DEFAULT 80,
	shuffle INTEGER NOT NULL DEFAULT 1,
	due_date INTEGER,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_refs (
	message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
	ref_type TEXT NOT NULL,
	ref_id TEXT NOT NULL,
	ref_title TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (message_id, ref_type, ref_id)
);

CREATE TABLE IF NOT EXISTS task_submissions (
	task_id TEXT NOT NULL REFERENCES classroom_tasks(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	classroom_id TEXT NOT NULL,
	best_score INTEGER NOT NULL DEFAULT 0,
	best_total INTEGER NOT NULL DEFAULT 0,
	best_pct INTEGER NOT NULL DEFAULT 0,
	attempts INTEGER NOT NULL DEFAULT 0,
	submitted INTEGER NOT NULL DEFAULT 0,
	submitted_at INTEGER,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_code ON classrooms(code);
CREATE INDEX IF NOT EXISTS idx_members_user ON classroom_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_class ON messages(classroom_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_refs_message ON message_refs(message_id, sort);
CREATE INDEX IF NOT EXISTS idx_tasks_class ON classroom_tasks(classroom_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_task ON task_submissions(task_id);

-- Beadandók: kiosztás, beküldés, feltöltés ---------------------------------------
CREATE TABLE IF NOT EXISTS classroom_assignments (
	id TEXT PRIMARY KEY,
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL DEFAULT '',
	description TEXT NOT NULL DEFAULT '',
	due_date INTEGER,
	require_text INTEGER NOT NULL DEFAULT 1,
	min_chars INTEGER NOT NULL DEFAULT 0,
	require_images INTEGER NOT NULL DEFAULT 0,
	max_images INTEGER NOT NULL DEFAULT 3,
	require_files INTEGER NOT NULL DEFAULT 0,
	max_files INTEGER NOT NULL DEFAULT 5,
	require_audio INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
	assignment_id TEXT NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	classroom_id TEXT NOT NULL,
	text_body TEXT NOT NULL DEFAULT '',
	submitted INTEGER NOT NULL DEFAULT 0,
	submitted_at INTEGER,
	updated_at INTEGER NOT NULL,
	grade INTEGER,
	feedback TEXT NOT NULL DEFAULT '',
	graded_at INTEGER,
	graded_by TEXT,
	PRIMARY KEY (assignment_id, user_id)
);

CREATE TABLE IF NOT EXISTS assignment_uploads (
	id TEXT PRIMARY KEY,
	assignment_id TEXT NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
	classroom_id TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind TEXT NOT NULL DEFAULT 'file',
	r2_key TEXT NOT NULL UNIQUE,
	file_name TEXT NOT NULL DEFAULT '',
	mime TEXT NOT NULL DEFAULT '',
	size INTEGER NOT NULL DEFAULT 0,
	width INTEGER,
	height INTEGER,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_class ON classroom_assignments(classroom_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assignment_subs_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_uploads_lookup
	ON assignment_uploads(assignment_id, user_id, created_at);

-- Biztonság, push, alkalmazás-beállítások -----------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
	token TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	email TEXT NOT NULL,
	code TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	used_at INTEGER,
	attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
	endpoint TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_config (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_email ON password_reset_tokens(email, created_at);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- Demo: az EGYETLEN hivatalos mintatartalom, csak Történelem ----------------------
-- Szerkezet: Történelem → 9. osztály / 10. osztály → tananyagok → 6 lecke,
-- leckénként 2 szekció-kvíz (3-3 kérdés) + 5 hivatalos kártya + 1 kártyacsomag.
-- A kvíz section_slug a leckeszöveg H2 címsorából képzett slug (lásd slugify).
-- Újrafuttatható: a régi demo sorokat előbb kitakarítja, a tanulói haladást
-- (lesson_progress) a megmaradó lecke-azonosítókon megőrzi.

-- 1) Régi demo kvízkérdések és kvízek (a frissülő + megszűnő leckékhez) ----
DELETE FROM quiz_questions WHERE quiz_id IN (
	SELECT id FROM quizzes WHERE lesson_id IN (
		'lesson-honfoglalas', 'lesson-allamalapitas', 'lesson-sejt-felepites',
		'lesson-aranybulla', 'lesson-tatarjaras', 'lesson-mohacs', 'lesson-rakoczi',
		'lesson-angol-a1-gyumolcsok', 'lesson-angol-b2-utazas'
	)
);
DELETE FROM quizzes WHERE lesson_id IN (
	'lesson-honfoglalas', 'lesson-allamalapitas', 'lesson-sejt-felepites',
	'lesson-aranybulla', 'lesson-tatarjaras', 'lesson-mohacs', 'lesson-rakoczi',
	'lesson-angol-a1-gyumolcsok', 'lesson-angol-b2-utazas'
);

-- 2) Régi demo kártyák és csomagok ------------------------------------------
DELETE FROM lesson_cards WHERE lesson_id IN (
	'lesson-honfoglalas', 'lesson-allamalapitas', 'lesson-sejt-felepites',
	'lesson-aranybulla', 'lesson-tatarjaras', 'lesson-mohacs', 'lesson-rakoczi',
	'lesson-angol-a1-gyumolcsok', 'lesson-angol-b2-utazas'
);
DELETE FROM lesson_card_packs WHERE lesson_id IN (
	'lesson-honfoglalas', 'lesson-allamalapitas', 'lesson-sejt-felepites',
	'lesson-aranybulla', 'lesson-tatarjaras', 'lesson-mohacs', 'lesson-rakoczi',
	'lesson-angol-a1-gyumolcsok', 'lesson-angol-b2-utazas'
);

-- 3) Megszűnő leckék haladása (a megmaradókét nem bántjuk) ------------------
DELETE FROM lesson_progress WHERE lesson_id IN (
	'lesson-sejt-felepites', 'lesson-angol-a1-gyumolcsok', 'lesson-angol-b2-utazas'
);

-- 4) Megszűnő leckék ---------------------------------------------------------
DELETE FROM lessons WHERE id IN (
	'lesson-honfoglalas', 'lesson-allamalapitas', 'lesson-sejt-felepites',
	'lesson-aranybulla', 'lesson-tatarjaras', 'lesson-mohacs', 'lesson-rakoczi',
	'lesson-angol-a1-gyumolcsok', 'lesson-angol-b2-utazas'
);

-- 5) Megszűnő tananyagok, szintek, tantárgyak --------------------------------
DELETE FROM materials WHERE id IN (
	'mat-ostortenet', 'mat-sejtbiologia',
	'mat-angol-a1-szokincs', 'mat-angol-b2-szokincs'
);
DELETE FROM levels WHERE id IN (
	'level-tort-alapozo', 'level-bio-alapozo',
	'level-angol-a1', 'level-angol-b2'
);
DELETE FROM subjects WHERE id IN ('subj-biologia', 'subj-angol');

-- 6) Történelem törzs ---------------------------------------------------------
INSERT OR IGNORE INTO subjects (id, title, icon, sort, created_at) VALUES
	('subj-tortenelem', 'Történelem', 'landmark', 0, 0);
UPDATE subjects SET level_label = 'Évfolyam' WHERE id = 'subj-tortenelem';

INSERT OR IGNORE INTO levels (id, subject_id, title, sort) VALUES
	('level-tort-9osztaly', 'subj-tortenelem', '9. osztály', 0),
	('level-tort-10osztaly', 'subj-tortenelem', '10. osztály', 1);

INSERT OR IGNORE INTO materials (id, level_id, title, sort) VALUES
	('mat-honfoglalas', 'level-tort-9osztaly', 'A honfoglalás és az államalapítás', 0),
	('mat-kozepkor', 'level-tort-9osztaly', 'Középkori Magyarország', 1),
	('mat-ujkor', 'level-tort-10osztaly', 'Újkori Magyarország', 0);

-- 7) Leckék -------------------------------------------------------------------
INSERT OR IGNORE INTO lessons (id, material_id, title, body_md, sort) VALUES
('lesson-honfoglalas', 'mat-honfoglalas', 'A honfoglalás', '## Előzmények: Etelköz és a kivándorlás

A magyarok őshazája az **Ural hegység** környékén, az úgynevezett **Magna Hungaria** területén volt.
A 9. századra a hét magyar törzs szövetsége a **Dnyeper és az Al-Duna** közötti sztyeppén, **Etelközben** élt.
A törzsszövetséget előbb **Álmos**, majd fia, **Árpád** vezette.
Etelközt 895 körül **besenyő támadás** érte, ezért a magyarság új hazát keresett.
A Kárpát-medence ekkor gyéren lakott, frank és bolgár befolyás alatt álló terület volt.

## A honfoglalás menete és a letelepedés

A honfoglalás **895–896-ban**, több hullámban zajlott le.
A magyar sereg a **Vereckei-hágón** át vonult be a Kárpát-medencébe.
A könnyűlovas harcmodor, a visszavonulást színlelő csel és a nyílzápor legyőzhetetlenné tette őket.
**899 és 970 között** kalandozó hadjáratokat vezettek szerte Európában.
A kalandozásoknak az **augsburgi vereség (955)** vetett véget.
Az **Árpád törzs** a Duna–Tisza közén telepedett le, a többi törzs a peremvidékeken kapott szállásterületet.', 0),
('lesson-allamalapitas', 'mat-honfoglalas', 'Az államalapítás', '## Géza fejedelem és a térítés

**Géza fejedelem (972–997)** ismerte fel, hogy a magyarság fennmaradásához csatlakozni kell a keresztény Európához.
Felesége, **Sarolt** révén megerősítette kapcsolatát az erdélyi előkelőkkel.
Békét kötött a német császárral, és **bajor térítő papokat** hívott az országba.
Megkezdte a törzsi szállásterületek fejedelmi kézbe vételét.
Fia, **Vajk (István)** már keresztény nevelést kapott, ez készítette elő az államalapítást.

## Szent István koronázása és az állam

István **997-ben** követte apját a fejedelmi székben, miután legyőzte nagybátyját, **Koppányt**.
**II. Szilveszter pápától koronát** kért és kapott, a független keresztény állam jelképét.
A koronázásra **1000-ben (vagy 1001 elején)** került sor Esztergomban, István lett Magyarország első királya.
Kiépítette a **vármegyerendszert**: az országot királyi várak köré szervezett megyékre osztotta, élükön az **ispánokkal**.
Törvényeivel védte a magántulajdont és a keresztény rendet, megalapította a **püspökségeket** Esztergommal az élen.
Műve, az **Intelmek** fiának, Imre hercegnek adott uralkodói tanácsokat tartalmaz.', 1),
('lesson-aranybulla', 'mat-kozepkor', 'Az Aranybulla', '## Az Aranybulla kiadása

**II. András** király **1222-ben** adta ki az Aranybullát.
A kiváltságlevelet a királyi **szerviensek** nyomására bocsátotta ki, akik a királytól közvetlenül függő katonáskodó nemesek voltak.
A megmozdulás hátterében a **merániai befolyás** elleni elégedetlenség állt.
Az oklevél hét példányban készült, egyet az **esztergomi káptalan** őrzött.

## Az Aranybulla pontjai

Az Aranybulla megerősítette a nemesek **személyes szabadságát**.
Kimondta az **évenkénti székesfehérvári törvénynapot**.
Rögzítette, hogy a nemesek katonai szolgálatra csak az **ország védelmében** kötelezhetők.
Tiltotta az **idegeneknek** adott méltóságok halmozását.
A záradék, az **ellenállási záradék** feljogosította a nemeseket az ellenállásra a törvénytelen királyi parancsokkal szemben.', 0),
('lesson-tatarjaras', 'mat-kozepkor', 'A tatárjárás és az újjáépítés', '## A tatárjárás

A mongol sereg **1236-ban** indult meg Európa felé **Batu kán** vezetésével.
IV. Béla megerősítette a keleti határokat, de a védelem széttagolt maradt.
A döntő ütközetre **1241-ben Muhinál** került sor, ahol a magyar sereg vereséget szenvedett.
A tatárok végigdúlták az országot, majd **1242-ben** váratlanul kivonultak.
A visszavonulás oka valószínűleg **Ögödej nagykán halála** volt.

## Újjáépítés IV. Béla alatt

IV. Bélát, a **második honalapítót** a kővárak építése jellemezte.
A király **kunokat telepített** az Alföldre a munkaerő pótlására.
Kiváltságokkal csábított **német telepeseket** az elnéptelenedett vidékekre.
Megerősítette a bárók és a köznemesség egyensúlyára épülő rendet.
Az újjáépítés nyomán az ország gazdasága és védelme megerősödött.', 1),
('lesson-mohacs', 'mat-ujkor', 'A mohácsi csata', '## Előzmények és a csata

A török sereg **I. Szulejmán** vezetésével 1526 nyarán indult Magyarország ellen.
Az országot gyenge központi hatalom jellemezte, **II. Lajos** fiatal király állt az élén.
A magyar sereg **1526. augusztus 29-én** állt ki Mohácsnál, fővezére **Tomori Pál** volt.
Létszámban és **tüzérségben** is elmaradt az oszmánoktól.
A csata alig **két óra alatt** súlyos magyar vereséggel végződött.
A király a menekülés közben a **Csele-patakba fulladt**.

## Következmények

Mohács után az ország **három részre szakadt**: királyi Magyarország, hódoltság, Erdély.
A nyugati országrészt **Habsburg Ferdinánd**, Erdélyt Szapolyai János uralta.
**Buda 1541-ben** került török kézre, ezzel kialakult a hódoltság.
A kettős királyválasztás polgárháborús évtizedeket hozott.
Mohács máig a **nemzeti tragédia** jelképe a magyar emlékezetben.', 0),
('lesson-rakoczi', 'mat-ujkor', 'A Rákóczi-szabadságharc', '## A szabadságharc

**II. Rákóczi Ferenc 1703-ban** indította meg szabadságharcát a Habsburgok ellen.
A fejedelem mellé álltak a **kuruc hadak**, élükön Esze Tamással.
A szabadságharc fénypontján az ország nagy része kuruc kézen volt.
Az **ónodi országgyűlés (1707)** kimondta a Habsburg-ház trónfosztását.
A harcok a szatmári békekötésig **nyolc évig** tartottak.

## A szatmári béke

A békét **1711-ben** kötötték meg Szatmár mellett.
A megállapodás **közkegyelmet** biztosított a kurucoknak.
A rendek megtarthatták **kiváltságaikat**, cserébe hűséget esküdtek.
Rákóczi nem fogadta el a békét, és **emigrációba vonult**.
A fejedelem a törökországi **Rodostóban** halt meg 1735-ben.', 1);

-- 8) Kvízek: leckénként 2, szekciónként 1 --------------------------------------
INSERT OR IGNORE INTO quizzes (id, lesson_id, section_slug, title, sort) VALUES
	('quiz-honfoglalas-1', 'lesson-honfoglalas', 'elozmenyek-etelkoz-es-a-kivandorlas', 'Előzmények – kvíz', 0),
	('quiz-honfoglalas-2', 'lesson-honfoglalas', 'a-honfoglalas-menete-es-a-letelepedes', 'A honfoglalás menete – kvíz', 1),
	('quiz-allamalapitas-1', 'lesson-allamalapitas', 'geza-fejedelem-es-a-terites', 'Géza fejedelem – kvíz', 0),
	('quiz-allamalapitas-2', 'lesson-allamalapitas', 'szent-istvan-koronazasa-es-az-allam', 'Szent István – kvíz', 1),
	('quiz-aranybulla-1', 'lesson-aranybulla', 'az-aranybulla-kiadasa', 'Az Aranybulla kiadása – kvíz', 0),
	('quiz-aranybulla-2', 'lesson-aranybulla', 'az-aranybulla-pontjai', 'Az Aranybulla pontjai – kvíz', 1),
	('quiz-tatarjaras-1', 'lesson-tatarjaras', 'a-tatarjaras', 'A tatárjárás – kvíz', 0),
	('quiz-tatarjaras-2', 'lesson-tatarjaras', 'ujjaepites-iv-bela-alatt', 'Az újjáépítés – kvíz', 1),
	('quiz-mohacs-1', 'lesson-mohacs', 'elozmenyek-es-a-csata', 'A csata – kvíz', 0),
	('quiz-mohacs-2', 'lesson-mohacs', 'kovetkezmenyek', 'Következmények – kvíz', 1),
	('quiz-rakoczi-1', 'lesson-rakoczi', 'a-szabadsagharc', 'A szabadságharc – kvíz', 0),
	('quiz-rakoczi-2', 'lesson-rakoczi', 'a-szatmari-beke', 'A szatmári béke – kvíz', 1);

-- 9) Kvízkérdések: kvízenként 3, vegyes típusokkal ------------------------------
INSERT OR IGNORE INTO quiz_questions (id, quiz_id, question_text, type, options_json, correct_answer, sort) VALUES
	-- A honfoglalás: előzmények
	('q28-honf-1', 'quiz-honfoglalas-1', 'Hol volt a magyarok őshazája?', 'choice', '["Az Ural hegység környékén", "A Kárpát-medencében", "Itáliában", "A Balkánon"]', 'Az Ural hegység környékén', 0),
	('q28-honf-2', 'quiz-honfoglalas-1', 'Etelközt besenyő támadás miatt kellett elhagyni.', 'tf', '["Igaz", "Hamis"]', 'Igaz', 1),
	('q28-honf-3', 'quiz-honfoglalas-1', 'Ki vezette a törzsszövetséget Álmos után?', 'text', '[]', 'Árpád', 2),
	-- A honfoglalás: menete
	('q28-honf-4', 'quiz-honfoglalas-2', 'Melyik hágón vonult be a magyar sereg a Kárpát-medencébe?', 'choice', '["A Vereckei-hágón", "A Tatár-hágón", "A Brenner-hágón", "A Vaskapun"]', 'A Vereckei-hágón', 0),
	('q28-honf-5', 'quiz-honfoglalas-2', 'Párosítsd az eseményeket az évszámokkal!', 'match', '{"pairs": [{"left": "Honfoglalás", "right": "895–896"}, {"left": "Augsburgi csata", "right": "955"}]}', '', 1),
	('q28-honf-6', 'quiz-honfoglalas-2', 'Rakd időrendi sorrendbe az eseményeket!', 'order', '["Honfoglalás (895–896)", "Kalandozások (899–970)", "Augsburgi vereség (955)"]', '["Honfoglalás (895–896)", "Kalandozások (899–970)", "Augsburgi vereség (955)"]', 2),
	-- Államalapítás: Géza
	('q28-allam-1', 'quiz-allamalapitas-1', 'Mettől meddig uralkodott Géza fejedelem?', 'choice', '["972–997", "895–907", "997–1038", "1000–1038"]', '972–997', 0),
	('q28-allam-2', 'quiz-allamalapitas-1', 'Géza bajor térítő papokat hívott az országba.', 'tf', '["Igaz", "Hamis"]', 'Igaz', 1),
	('q28-allam-3', 'quiz-allamalapitas-1', 'Ki volt Géza fejedelem felesége?', 'text', '[]', 'Sarolt', 2),
	-- Államalapítás: István
	('q28-allam-4', 'quiz-allamalapitas-2', 'Kit győzött le István a hatalom megszerzéséért?', 'choice', '["Koppányt", "Gézát", "Saroltot", "Gyulát"]', 'Koppányt', 0),
	('q28-allam-5', 'quiz-allamalapitas-2', 'Melyik pápa küldte a koronát Istvánnak?', 'text', '[]', 'II. Szilveszter', 1),
	('q28-allam-6', 'quiz-allamalapitas-2', 'Párosítsd a személyeket a szerepükkel!', 'match', '{"pairs": [{"left": "Koppány", "right": "Pogány lázadó"}, {"left": "II. Szilveszter", "right": "Koronát küldő pápa"}, {"left": "Imre herceg", "right": "Az Intelmek címzettje"}]}', '', 2),
	-- Aranybulla: kiadás
	('q28-arany-1', 'quiz-aranybulla-1', 'Melyik évben adta ki II. András az Aranybullát?', 'choice', '["1222-ben", "1221-ben", "1231-ben", "1205-ben"]', '1222-ben', 0),
	('q28-arany-2', 'quiz-aranybulla-1', 'Az Aranybullát a királyi szerviensek nyomására adták ki.', 'tf', '["Igaz", "Hamis"]', 'Igaz', 1),
	('q28-arany-3', 'quiz-aranybulla-1', 'Kik kényszerítették ki II. Andrástól az Aranybullát?', 'text', '[]', 'A szerviensek', 2),
	-- Aranybulla: pontok
	('q28-arany-4', 'quiz-aranybulla-2', 'Mit mondott ki az ellenállási záradék?', 'choice', '["A nemesek ellenállhatnak a törvénytelen királyi parancsnak", "A jobbágyok megtagadhatják a robotot", "Az egyház kizárhatja a királyt", "A nádor leválthatja a királyt"]', 'A nemesek ellenállhatnak a törvénytelen királyi parancsnak', 0),
	('q28-arany-5', 'quiz-aranybulla-2', 'Hol tartották az évenkénti törvénynapot?', 'choice', '["Székesfehérváron", "Esztergomban", "Budán", "Veszprémben"]', 'Székesfehérváron', 1),
	('q28-arany-6', 'quiz-aranybulla-2', 'Párosítsd a fogalmakat a jelentésükkel!', 'match', '{"pairs": [{"left": "Szerviens", "right": "Katonáskodó nemes"}, {"left": "Ellenállási záradék", "right": "Jogos ellenállás"}, {"left": "Esztergomi káptalan", "right": "Példányőrző"}]}', '', 2),
	-- Tatárjárás
	('q28-tatar-1', 'quiz-tatarjaras-1', 'Mikor zajlott a muhi csata?', 'choice', '["1241-ben", "1236-ban", "1242-ben", "1222-ben"]', '1241-ben', 0),
	('q28-tatar-2', 'quiz-tatarjaras-1', 'A tatárok Ögödej nagykán halála után vonultak ki az országból.', 'tf', '["Igaz", "Hamis"]', 'Igaz', 1),
	('q28-tatar-3', 'quiz-tatarjaras-1', 'Ki vezette a mongol sereget Európa felé?', 'text', '[]', 'Batu kán', 2),
	-- Újjáépítés
	('q28-tatar-4', 'quiz-tatarjaras-2', 'Kit nevezünk második honalapítónak?', 'choice', '["IV. Bélát", "II. Andrást", "I. Lászlót", "Könyves Kálmánt"]', 'IV. Bélát', 0),
	('q28-tatar-5', 'quiz-tatarjaras-2', 'Párosítsd a személyeket a szerepükkel!', 'match', '{"pairs": [{"left": "Batu kán", "right": "Mongol vezér"}, {"left": "IV. Béla", "right": "Magyar király"}, {"left": "Ögödej", "right": "Nagykán"}]}', '', 1),
	('q28-tatar-6', 'quiz-tatarjaras-2', 'Rakd időrendi sorrendbe az eseményeket!', 'order', '["Mongol indulás (1236)", "Muhinál vereség (1241)", "Tatár kivonulás (1242)"]', '["Mongol indulás (1236)", "Muhinál vereség (1241)", "Tatár kivonulás (1242)"]', 2),
	-- Mohács: csata
	('q28-mohacs-1', 'quiz-mohacs-1', 'Mikor volt a mohácsi csata?', 'choice', '["1526. augusztus 29-én", "1526. szeptember 29-én", "1541-ben", "1241-ben"]', '1526. augusztus 29-én', 0),
	('q28-mohacs-2', 'quiz-mohacs-1', 'II. Lajos a Csele-patakba fulladt a csata után.', 'tf', '["Igaz", "Hamis"]', 'Igaz', 1),
	('q28-mohacs-3', 'quiz-mohacs-1', 'Ki volt a magyar sereg fővezére Mohácsnál?', 'text', '[]', 'Tomori Pál', 2),
	-- Mohács: következmények
	('q28-mohacs-4', 'quiz-mohacs-2', 'Mikor került Buda török kézre?', 'choice', '["1541-ben", "1526-ban", "1529-ben", "1686-ban"]', '1541-ben', 0),
	('q28-mohacs-5', 'quiz-mohacs-2', 'Hány részre szakadt az ország Mohács után?', 'text', '[]', 'Három', 1),
	('q28-mohacs-6', 'quiz-mohacs-2', 'Párosítsd az évszámokat az eseményekkel!', 'match', '{"pairs": [{"left": "1526", "right": "Mohácsi csata"}, {"left": "1541", "right": "Buda eleste"}, {"left": "1241", "right": "Muhi csata"}]}', '', 2),
	-- Rákóczi: szabadságharc
	('q28-rakoczi-1', 'quiz-rakoczi-1', 'Mikor kezdődött a Rákóczi-szabadságharc?', 'choice', '["1703-ban", "1707-ben", "1711-ben", "1686-ban"]', '1703-ban', 0),
	('q28-rakoczi-2', 'quiz-rakoczi-1', 'Az ónodi országgyűlés kimondta a Habsburg-ház trónfosztását.', 'tf', '["Igaz", "Hamis"]', 'Igaz', 1),
	('q28-rakoczi-3', 'quiz-rakoczi-1', 'Ki állt a kuruc hadak élén a kezdetekben?', 'text', '[]', 'Esze Tamás', 2),
	-- Rákóczi: béke
	('q28-rakoczi-4', 'quiz-rakoczi-2', 'Mikor kötötték meg a szatmári békét?', 'choice', '["1711-ben", "1707-ben", "1735-ben", "1723-ban"]', '1711-ben', 0),
	('q28-rakoczi-5', 'quiz-rakoczi-2', 'Hol halt meg II. Rákóczi Ferenc?', 'text', '[]', 'Rodostóban', 1),
	('q28-rakoczi-6', 'quiz-rakoczi-2', 'Párosítsd az évszámokat az eseményekkel!', 'match', '{"pairs": [{"left": "1703", "right": "Szabadságharc kezdete"}, {"left": "1707", "right": "Ónodi országgyűlés"}, {"left": "1711", "right": "Szatmári béke"}]}', '', 2);

-- 10) Hivatalos kártyák: leckénként 5 -----------------------------------------
INSERT OR IGNORE INTO lesson_cards (id, lesson_id, section_slug, front, back, sort) VALUES
	('lc28-honf-1', 'lesson-honfoglalas', 'elozmenyek-etelkoz-es-a-kivandorlas', 'Magna Hungaria', 'A magyarok őshazája az Ural hegység környékén', 0),
	('lc28-honf-2', 'lesson-honfoglalas', 'elozmenyek-etelkoz-es-a-kivandorlas', 'Etelköz', 'A Dnyeper és az Al-Duna közötti sztyeppe, ahonnan 895 körül kivándoroltunk', 1),
	('lc28-honf-3', 'lesson-honfoglalas', 'elozmenyek-etelkoz-es-a-kivandorlas', 'Árpád', 'Álmos fia, a törzsszövetség vezére a honfoglaláskor', 2),
	('lc28-honf-4', 'lesson-honfoglalas', 'a-honfoglalas-menete-es-a-letelepedes', 'Vereckei-hágó', 'Itt vonult be a magyar sereg a Kárpát-medencébe 895–896-ban', 3),
	('lc28-honf-5', 'lesson-honfoglalas', 'a-honfoglalas-menete-es-a-letelepedes', 'Augsburg, 955', 'A kalandozó hadjáratokat lezáró vereség éve és helye', 4),
	('lc28-allam-1', 'lesson-allamalapitas', 'geza-fejedelem-es-a-terites', 'Géza fejedelem (972–997)', 'Csatlakozás a keresztény Európához, bajor térítő papok', 0),
	('lc28-allam-2', 'lesson-allamalapitas', 'geza-fejedelem-es-a-terites', 'Sarolt', 'Géza felesége, az erdélyi kapcsolat megerősítője', 1),
	('lc28-allam-3', 'lesson-allamalapitas', 'szent-istvan-koronazasa-es-az-allam', 'Koppány', 'István nagybátyja, a pogány rend visszaállítására törekedett', 2),
	('lc28-allam-4', 'lesson-allamalapitas', 'szent-istvan-koronazasa-es-az-allam', 'II. Szilveszter pápa', 'Tőle kapta István a koronát, 1000-ben koronázták', 3),
	('lc28-allam-5', 'lesson-allamalapitas', 'szent-istvan-koronazasa-es-az-allam', 'Vármegyerendszer', 'Királyi várak köré szervezett megyék, élükön az ispánokkal', 4),
	('lc28-arany-1', 'lesson-aranybulla', 'az-aranybulla-kiadasa', 'Aranybulla, 1222', 'II. András kiváltságlevele a szerviensek nyomására', 0),
	('lc28-arany-2', 'lesson-aranybulla', 'az-aranybulla-kiadasa', 'Szerviensek', 'A királytól közvetlenül függő katonáskodó nemesek', 1),
	('lc28-arany-3', 'lesson-aranybulla', 'az-aranybulla-pontjai', 'Székesfehérvári törvénynap', 'Évenkénti nemesi gyűlés az Aranybulla szerint', 2),
	('lc28-arany-4', 'lesson-aranybulla', 'az-aranybulla-pontjai', 'Ellenállási záradék', 'Ellenállás a törvénytelen királyi parancsokkal szemben', 3),
	('lc28-arany-5', 'lesson-aranybulla', 'az-aranybulla-pontjai', 'Merániai befolyás', 'Az elégedetlenség háttere II. András udvarában', 4),
	('lc28-tatar-1', 'lesson-tatarjaras', 'a-tatarjaras', 'Batu kán', 'A mongol sereg vezére, 1236-ban indult Európa felé', 0),
	('lc28-tatar-2', 'lesson-tatarjaras', 'a-tatarjaras', 'Muhi, 1241', 'A döntő ütközet helye és éve, magyar vereség', 1),
	('lc28-tatar-3', 'lesson-tatarjaras', 'a-tatarjaras', 'Ögödej nagykán', 'Halála (1242) a tatár kivonulás valószínű oka', 2),
	('lc28-tatar-4', 'lesson-tatarjaras', 'ujjaepites-iv-bela-alatt', 'Második honalapító', 'IV. Béla az újjáépítés után', 3),
	('lc28-tatar-5', 'lesson-tatarjaras', 'ujjaepites-iv-bela-alatt', 'Kunok és német telepesek', 'Az elnéptelenedett vidékek újranépesítői', 4),
	('lc28-mohacs-1', 'lesson-mohacs', 'elozmenyek-es-a-csata', '1526. augusztus 29.', 'A mohácsi csata napja', 0),
	('lc28-mohacs-2', 'lesson-mohacs', 'elozmenyek-es-a-csata', 'Tomori Pál', 'A magyar sereg fővezére Mohácsnál', 1),
	('lc28-mohacs-3', 'lesson-mohacs', 'elozmenyek-es-a-csata', 'Csele-patak', 'II. Lajos itt lelte halálát menekülés közben', 2),
	('lc28-mohacs-4', 'lesson-mohacs', 'kovetkezmenyek', 'Három részre szakadás', 'Királyi Magyarország, hódoltság, Erdély', 3),
	('lc28-mohacs-5', 'lesson-mohacs', 'kovetkezmenyek', 'Buda eleste, 1541', 'Ezzel kialakult a hódoltság', 4),
	('lc28-rakoczi-1', 'lesson-rakoczi', 'a-szabadsagharc', '1703', 'A Rákóczi-szabadságharc kezdete', 0),
	('lc28-rakoczi-2', 'lesson-rakoczi', 'a-szabadsagharc', 'Esze Tamás', 'A kuruc hadak kezdeti vezére', 1),
	('lc28-rakoczi-3', 'lesson-rakoczi', 'a-szabadsagharc', 'Ónodi országgyűlés, 1707', 'A Habsburg-ház trónfosztása', 2),
	('lc28-rakoczi-4', 'lesson-rakoczi', 'a-szatmari-beke', 'Szatmári béke, 1711', 'Közkegyelm a kurucoknak, rendi kiváltságok megmaradnak', 3),
	('lc28-rakoczi-5', 'lesson-rakoczi', 'a-szatmari-beke', 'Rodostó, 1735', 'Rákóczi emigrációjának és halálának helye és éve', 4);

-- 11) Kártyacsomagok: leckénként 1, a kártyák csomagba sorolva ----------------
INSERT OR IGNORE INTO lesson_card_packs (id, lesson_id, title, sort) VALUES
	('lcp-lesson-honfoglalas', 'lesson-honfoglalas', 'A honfoglalás - kártyák', 0),
	('lcp-lesson-allamalapitas', 'lesson-allamalapitas', 'Az államalapítás - kártyák', 0),
	('lcp-lesson-aranybulla', 'lesson-aranybulla', 'Az Aranybulla - kártyák', 0),
	('lcp-lesson-tatarjaras', 'lesson-tatarjaras', 'A tatárjárás - kártyák', 0),
	('lcp-lesson-mohacs', 'lesson-mohacs', 'A mohácsi csata - kártyák', 0),
	('lcp-lesson-rakoczi', 'lesson-rakoczi', 'A Rákóczi-szabadságharc - kártyák', 0);

UPDATE lesson_cards SET pack_id = 'lcp-' || lesson_id
WHERE lesson_id IN (
	'lesson-honfoglalas', 'lesson-allamalapitas', 'lesson-aranybulla',
	'lesson-tatarjaras', 'lesson-mohacs', 'lesson-rakoczi'
) AND pack_id IS NULL;
