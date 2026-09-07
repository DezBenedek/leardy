import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/data/library_store.dart';
import 'package:leardy/data/local/database.dart';
import 'package:leardy/features/cards/library_query.dart';
import 'package:leardy/providers.dart';

void main() {
  test('seed creates topic and skill bundles', () async {
    final db = LeardyDatabase(NativeDatabase.memory());
    final store = LibraryStore(db);
    await store.seedIfEmpty();

    final public = await store.listPublicBundles('local');
    expect(public, isNotEmpty);
    expect(public.any((b) => b.title == 'Honfoglalás' && b.isTopic), isTrue);
    expect(public.any((b) => b.title == 'Konyhai igék' && b.isSkill), isTrue);
    expect(await store.listSavedBundles('local'), isEmpty);

    final honfoglalas = public.firstWhere((b) => b.title == 'Honfoglalás');
    expect(honfoglalas.canLearn, isTrue);
    expect(honfoglalas.cardsSetId, isNotNull);
    expect(honfoglalas.mapActivityId, isNotNull);

    final subjects = await store.watchSubjects().first;
    expect(
      subjects.map((s) => s.name),
      containsAll([
        'nyelvtan',
        'matematika',
        'angol',
        'tortenelem',
        'biologia',
        'digitalis-kultura',
        'hittan',
        'egyeb',
      ]),
    );
    expect(subjects.where((s) => s.name == 'angol').length, 1);

    final lessons = await store.lessonsForBundle(honfoglalas.id);
    expect(lessons.length, greaterThanOrEqualTo(2));
    final pages = await store.pagesForLesson(lessons.first.id);
    expect(pages.length, greaterThanOrEqualTo(2));

    final hotspots = await store.hotspotsForActivity(
      honfoglalas.mapActivityId!,
    );
    expect(hotspots.any((h) => h.name == 'Etelköz'), isTrue);

    final extra = await store.addLesson(
      bundleId: honfoglalas.id,
      title: 'Tatárjárás',
      body: '1241–42.',
    );
    final lessonsAfter = await store.lessonsForBundle(honfoglalas.id);
    expect(lessonsAfter.length, greaterThanOrEqualTo(3));
    expect(lessonsAfter.any((l) => l.id == extra), isTrue);

    final created = await store.createBundle(
      kind: 'topic',
      title: 'Sejt',
      subject: 'biologia',
      ownerUserId: 'local',
    );
    expect(await store.lessonsForBundle(created), isEmpty);
    expect((await store.bundleById(created, 'local'))?.cardsSetId, isNull);

    final withLessons = await store.createBundle(
      kind: 'topic',
      title: 'Sejt 2',
      subject: 'biologia',
      ownerUserId: 'local',
      lessons: const [
        (title: 'Sejtszervecskék', body: 'Mitokondrium.'),
        (title: 'Fotoszintézis', body: 'Fényből cukor.'),
      ],
    );
    expect((await store.lessonsForBundle(withLessons)).length, 2);
    expect(
      (await store.exercisesForLesson(
        (await store.lessonsForBundle(honfoglalas.id)).first.id,
      )),
      isNotEmpty,
    );

    await store.seedIfEmpty();
    expect(
      (await store.watchSubjects().first)
          .where((s) => s.name == 'angol')
          .length,
      1,
    );

    await db.close();
  });

  test('renames legacy subjects and keeps recents first', () async {
    final db = LeardyDatabase(NativeDatabase.memory());
    final now = DateTime.now().millisecondsSinceEpoch;
    await db
        .into(db.subjects)
        .insert(
          SubjectsCompanion.insert(
            id: 'legacy-magyar',
            name: 'Magyar nyelv',
            colorKey: 'slate',
            createdAt: now,
            updatedAt: now,
          ),
        );
    final store = LibraryStore(db);
    await store.ensureFixedSubjects();

    final subjects = await store.watchSubjects().first;
    expect(subjects.any((s) => s.name == 'nyelvtan'), isTrue);
    expect(subjects.any((s) => s.name == 'Magyar nyelv'), isFalse);
    expect(
      subjects.firstWhere((s) => s.name == 'nyelvtan').category,
      'humanities',
    );

    final matematika = subjects.firstWhere((s) => s.name == 'matematika');
    final angol = subjects.firstWhere((s) => s.name == 'angol');
    await store.touchRecentSubject(matematika.id);
    await store.touchRecentSubject(angol.id);
    expect(await store.recentSubjectIds(), [angol.id, matematika.id]);

    await db.close();
  });

  test('unsave updates public watch so discover can show the bundle', () async {
    final db = LeardyDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final store = LibraryStore(db);
    await store.seedIfEmpty();
    final bundle = (await store.listPublicBundles('u1')).first;
    await store.saveBundle(bundle.id, 'u1');
    expect((await store.bundleById(bundle.id, 'u1'))?.saved, isTrue);

    final shownAgain = store
        .watchPublicBundles('u1')
        .firstWhere(
          (list) => list.any((item) => item.id == bundle.id && !item.saved),
        );
    await store.unsaveBundle(bundle.id, 'u1');
    final public = await shownAgain.timeout(const Duration(seconds: 2));
    final unsaved = public.firstWhere((item) => item.id == bundle.id);
    expect(unsaved.saved, isFalse);
    expect(
      bundleMatchesQuery(
        bundle: unsaved,
        search: '',
        query: const CardsQuery(),
        discover: true,
      ),
      isTrue,
    );
  });
}
