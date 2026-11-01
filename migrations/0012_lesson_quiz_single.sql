-- Lecke kvíz 1:1: egy leckéhez legfeljebb egy kvíz sor tartozhat.
-- A blokk szintű section_slug értéket előbb kérdés szintre másoljuk,
-- hogy az összevonás ne veszítse el a bekezdés bekötést.
-- Utána a kérdések egy cél kvízbe kerülnek, az eredeti blokksorrend megtartásával.
-- A D1 nem támogat TEMP táblát, ezért a térkép CTE-ként, utasításonként szerepel.
-- Sorrend: előbb az újraszámozás (eredeti állapoton), csak utána a mozgatás.
-- Így a CTE mindkétszer ugyanazt a célkvíz-besorolást adja, mintha a térkép
-- egyszer készült volna el: a besorolás csak a kvízek sorrendjétől függ,
-- az pedig egyik lépésben sem változik.

-- 1. Örökölt blokk kapcsolat rögzítése a kérdéseken.
UPDATE quiz_questions
SET section_slug = (
	SELECT COALESCE(q.section_slug, '')
	FROM quizzes q
	WHERE q.id = quiz_questions.quiz_id
)
WHERE COALESCE(section_slug, '') = ''
AND (SELECT COALESCE(q2.section_slug, '') FROM quizzes q2 WHERE q2.id = quiz_questions.quiz_id) != '';

-- 2-3. Cél kvíz leckénként és kérdéstérkép CTE-ként.
-- 4. Sorrend újraszámozása a cél kvízben (még mozgatás előtt).
WITH _quiz_target AS (
	SELECT lesson_id, id AS quiz_id,
		ROW_NUMBER() OVER (PARTITION BY lesson_id ORDER BY COALESCE(sort, 0), title, id) AS rn
	FROM quizzes
),
_qq_map AS (
	SELECT qq.id AS id, t.quiz_id AS target_id,
		ROW_NUMBER() OVER (
			PARTITION BY t.quiz_id
			ORDER BY q.sort, q.title, q.id, qq.sort, qq.id
		) - 1 AS new_sort
	FROM quiz_questions qq
	JOIN quizzes q ON q.id = qq.quiz_id
	JOIN _quiz_target t0 ON t0.quiz_id = q.id
	JOIN _quiz_target t ON t.lesson_id = t0.lesson_id AND t.rn = 1
)
UPDATE quiz_questions
SET sort = (SELECT new_sort FROM _qq_map WHERE _qq_map.id = quiz_questions.id)
WHERE EXISTS (SELECT 1 FROM _qq_map WHERE _qq_map.id = quiz_questions.id);

-- 5. Kérdések átmozgatása a cél kvízbe.
WITH _quiz_target AS (
	SELECT lesson_id, id AS quiz_id,
		ROW_NUMBER() OVER (PARTITION BY lesson_id ORDER BY COALESCE(sort, 0), title, id) AS rn
	FROM quizzes
),
_qq_map AS (
	SELECT qq.id AS id, t.quiz_id AS target_id,
		ROW_NUMBER() OVER (
			PARTITION BY t.quiz_id
			ORDER BY q.sort, q.title, q.id, qq.sort, qq.id
		) - 1 AS new_sort
	FROM quiz_questions qq
	JOIN quizzes q ON q.id = qq.quiz_id
	JOIN _quiz_target t0 ON t0.quiz_id = q.id
	JOIN _quiz_target t ON t.lesson_id = t0.lesson_id AND t.rn = 1
)
UPDATE quiz_questions
SET quiz_id = (SELECT target_id FROM _qq_map WHERE _qq_map.id = quiz_questions.id)
WHERE EXISTS (
	SELECT 1 FROM _qq_map
	WHERE _qq_map.id = quiz_questions.id AND _qq_map.target_id != quiz_questions.quiz_id
);

-- 6. Felesleges kvíz sorok törlése (a kérdések már átkerültek).
WITH _quiz_target AS (
	SELECT lesson_id, id AS quiz_id,
		ROW_NUMBER() OVER (PARTITION BY lesson_id ORDER BY COALESCE(sort, 0), title, id) AS rn
	FROM quizzes
)
DELETE FROM quizzes WHERE id NOT IN (SELECT quiz_id FROM _quiz_target WHERE rn = 1);

-- 7. Blokk szintű bekötés kiürítése, a kérdés szintű marad a mérvadó.
UPDATE quizzes SET section_slug = '';

-- 8. Egy leckéhez csak egy kvíz tartozhat.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_lesson_unique ON quizzes(lesson_id);
