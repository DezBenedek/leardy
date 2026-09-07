import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/data/auth/session_store.dart';
import 'package:leardy/data/library_store.dart';
import 'package:leardy/data/local/database.dart';
import 'package:leardy/design_system/theme/app_theme.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/features/study/lesson_editor_page.dart';
import 'package:leardy/features/study/lesson_practice_panel.dart';
import 'package:leardy/features/study/lesson_reader_page.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

void main() {
  late LeardyDatabase db;
  late LibraryStore store;

  setUp(() {
    db = LeardyDatabase(NativeDatabase.memory());
    store = LibraryStore(db);
  });

  tearDown(() async {
    await db.close();
  });

  Future<({String bundleId, String lessonId})> seedLesson() async {
    final bundleId = await store.createBundle(
      kind: 'topic',
      title: 'Témakör',
      subject: 'Történelem',
      ownerUserId: 'local',
    );
    final lessonId = await store.addLesson(
      bundleId: bundleId,
      title: 'Teszt lecke',
      body: 'Első lépés szövege',
    );
    await store.addLessonPage(
      lessonId: lessonId,
      body: 'Második lépés szövege',
      type: LessonStepType.fact,
    );
    await store.addExercise(
      lessonId: lessonId,
      type: LessonExerciseType.flip,
      prompt: 'Mi a kérdés?',
      answer: 'A válasz',
    );
    return (bundleId: bundleId, lessonId: lessonId);
  }

  test('title update keeps pages and reorder persists', () async {
    final seeded = await seedLesson();
    final before = await store.pagesForLesson(seeded.lessonId);
    expect(before, hasLength(2));

    await store.updateLessonTitle(id: seeded.lessonId, title: 'Új cím');
    final afterTitle = await store.pagesForLesson(seeded.lessonId);
    expect(afterTitle.map((page) => page.body), [
      'Első lépés szövege',
      'Második lépés szövege',
    ]);
    expect((await store.lessonById(seeded.lessonId))!.title, 'Új cím');

    await store.reorderLessonPages(seeded.lessonId, [
      before[1].id,
      before[0].id,
    ]);
    final reordered = await store.pagesForLesson(seeded.lessonId);
    expect(reordered.map((page) => page.body), [
      'Második lépés szövege',
      'Első lépés szövege',
    ]);
    expect(reordered.map((page) => page.sortOrder), [0, 1]);
  });

  test('exercise type and order stay consistent after delete', () async {
    final seeded = await seedLesson();
    final first = (await store.exercisesForLesson(seeded.lessonId)).single;
    final second = await store.addExercise(
      lessonId: seeded.lessonId,
      type: LessonExerciseType.choice,
      prompt: 'Válassz',
      answer: 'Igen',
      payload: {
        'options': ['Igen', 'Nem'],
      },
    );
    await store.reorderExercises(seeded.lessonId, [second, first.id]);
    var items = await store.exercisesForLesson(seeded.lessonId);
    expect(items.map((item) => item.id), [second, first.id]);

    await store.updateExercise(
      id: second,
      type: LessonExerciseType.type,
      answer: 'Igen',
    );
    await store.deleteExercise(first.id);
    items = await store.exercisesForLesson(seeded.lessonId);
    expect(items, hasLength(1));
    expect(items.single.type, LessonExerciseType.type);
    expect(items.single.sortOrder, 0);
  });

  testWidgets('editor shows the whole lesson and saves by block id', (
    tester,
  ) async {
    final seeded = await seedLesson();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [databaseProvider.overrideWith((ref) => db)],
        child: MaterialApp(
          theme: LeardyTheme.light,
          locale: const Locale('hu'),
          supportedLocales: L10n.supported,
          localizationsDelegates: const [
            L10n.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: LessonEditorPage(
            bundleId: seeded.bundleId,
            lessonId: seeded.lessonId,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    // A tartalom-szerkesztő lapozós: először csak az első oldal látszik.
    expect(find.text('Első lépés szövege'), findsOneWidget);
    expect(find.text('Második lépés szövege'), findsNothing);
    expect(find.text('Tartalom'), findsOneWidget);
    expect(find.text('Szöveg'), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextField, 'Első lépés szövege'),
      'Javított első',
    );
    await tester.pump(const Duration(milliseconds: 400));

    final pages = await store.pagesForLesson(seeded.lessonId);
    expect(pages[0].body, 'Javított első');
    expect(pages[1].body, 'Második lépés szövege');

    // Cím átnevezése még lapozás előtt (felül van, később kilógna).
    await tester.enterText(find.byType(TextField).first, 'Átnevezett lecke');
    await tester.pump(const Duration(milliseconds: 400));
    expect(
      (await store.lessonById(seeded.lessonId))!.title,
      'Átnevezett lecke',
    );

    // Lapozás a második oldalra a tovább-gombbal.
    await tester.ensureVisible(find.byIcon(Icons.chevron_right_rounded));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.chevron_right_rounded));
    await tester.pumpAndSettle();
    expect(find.text('Második lépés szövege'), findsOneWidget);
    expect(find.text('Lényeg'), findsOneWidget);

    expect((await store.pagesForLesson(seeded.lessonId)).length, 2);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 50));
  });

  testWidgets('order exercise reorders with the drag handle', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LessonPracticePanel(
            exercises: [
              LessonExerciseView(
                id: 'o1',
                lessonId: 'l',
                type: LessonExerciseType.order,
                prompt: 'Rakd sorba',
                answer: '',
                payload: {
                  'items': ['egy', 'kettő', 'három'],
                },
                sortOrder: 0,
              ),
            ],
            onFinished: () {},
          ),
        ),
      ),
    );
    await tester.pump();

    const names = ['egy', 'kettő', 'három'];
    for (final name in names) {
      expect(find.text(name), findsOneWidget);
    }
    expect(find.byIcon(Icons.drag_handle_rounded), findsNWidgets(3));

    double dy(String name) => tester.getTopLeft(find.text(name)).dy;
    final grabbed = names.reduce((a, b) => dy(a) < dy(b) ? a : b);
    final before = dy(grabbed);

    // A legfelső elem fogóját lehúzzuk: egy hellyel lejjebb kerül.
    await tester.drag(
      find.byIcon(Icons.drag_handle_rounded).first,
      const Offset(0, 120),
    );
    await tester.pumpAndSettle();

    expect(dy(grabbed), greaterThan(before));
  });

  testWidgets('lesson reader has no header chrome', (tester) async {
    final seeded = await seedLesson();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWith((ref) => db),
          sessionStoreProvider.overrideWith((ref) => _FakeSessionStore()),
        ],
        child: MaterialApp(
          theme: LeardyTheme.light,
          locale: const Locale('hu'),
          supportedLocales: L10n.supported,
          localizationsDelegates: const [
            L10n.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: LessonReaderPage(
            bundleId: seeded.bundleId,
            lessonId: seeded.lessonId,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(AppBar), findsNothing);
    expect(find.byType(SegmentedButton<bool>), findsNothing);
    expect(find.text('Tartalom'), findsNothing);
    expect(find.text('Gyakorlás'), findsNothing);
    expect(find.text('Első lépés szövege'), findsOneWidget);
    expect(find.text('Tovább'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}

class _FakeSessionStore extends SessionStore {
  @override
  Future<String?> token() async => null;

  @override
  Future<({String id, String username, String? email, bool isTeacher})?> user() async =>
      null;

  @override
  Future<void> save({
    required String token,
    required String id,
    required String username,
    String? email,
    bool isTeacher = false,
  }) async {}

  @override
  Future<void> clear() async {}
}
