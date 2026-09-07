import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/data/library_store.dart';
import 'package:leardy/data/local/database.dart';

void main() {
  test('searchCards finds across decks and skips deleted', () async {
    final db = LeardyDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final store = LibraryStore(db);
    await store.ensureFixedSubjects();

    final subjects = await store.watchSubjects().first;
    final angol = subjects.firstWhere((s) => s.name == 'angol');
    final deckA = await store.createDeck(
      subjectId: angol.id,
      name: 'Konyha',
      ownerUserId: 'local',
    );
    final deckB = await store.createDeck(
      subjectId: angol.id,
      name: 'Iskola',
      ownerUserId: 'local',
    );
    await store.upsertCard(deckId: deckA, front: 'forral', back: 'boil');
    final gone = await store.upsertCard(
      deckId: deckA,
      front: 'törlendő szó',
      back: 'gone',
    );
    await store.deleteCard(gone);
    await store.upsertCard(deckId: deckB, front: 'füzet', back: 'notebook');

    final hits = await store.searchCards('forr');
    expect(hits.map((h) => h.card.front), contains('forral'));
    expect(hits.first.deckName, 'Konyha');

    // A törölt kártya nem találat — a másik szett szava igen.
    final goneHits = await store.searchCards('törlendő');
    expect(goneHits, isEmpty);
    final school = await store.searchCards('NOTEBOOK');
    expect(school.map((h) => h.card.front), contains('füzet'));

    expect(await store.searchCards('   '), isEmpty);
  });
}
