import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/data/library_store.dart';
import 'package:leardy/data/local/database.dart';
import 'package:leardy/domain/models.dart';

int levelOf(List<CardView> cards, String front) =>
    cards.firstWhere((c) => c.front == front).level;

void main() {
  test('level counter: starts at 0, +1 on correct, -1 on wrong', () async {
    final db = LeardyDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final store = LibraryStore(db);
    await store.ensureFixedSubjects();

    final subjects = await store.watchSubjects().first;
    final angol = subjects.firstWhere((s) => s.name == 'angol');
    final deckId = await store.createDeck(
      subjectId: angol.id,
      name: 'Mérés',
      ownerUserId: 'local',
    );
    await store.upsertCard(deckId: deckId, front: 'egy', back: 'one');
    await store.upsertCard(deckId: deckId, front: 'kettő', back: 'two');

    // Alapból 0-ról indul, semmi sincs megtanulva.
    var deck = await store.deckById(deckId);
    expect(deck!.cardCount, 2);
    expect(deck.masteredCount, 0);
    var cards = await store.cardsForDeck(deckId);
    final first = cards.firstWhere((c) => c.front == 'egy');
    expect(levelOf(cards, 'egy'), 0);

    // 1 helyes = 1 csík, de még nem megtanulva.
    await store.recordReview(
      card: first,
      grade: ReviewGrade.good,
      mode: PracticeMode.flip,
      wasCorrect: true,
    );
    cards = await store.cardsForDeck(deckId);
    expect(levelOf(cards, 'egy'), 1);
    expect((await store.deckById(deckId))!.masteredCount, 0);

    // 4. csíknál megtanulva.
    for (var i = 0; i < 3; i++) {
      await store.recordReview(
        card: first,
        grade: ReviewGrade.good,
        mode: PracticeMode.flip,
        wasCorrect: true,
      );
    }
    cards = await store.cardsForDeck(deckId);
    expect(levelOf(cards, 'egy'), 4);
    expect((await store.deckById(deckId))!.masteredCount, 1);

    // Rontás: -1, már nem számít megtanultnak.
    await store.recordReview(
      card: first,
      grade: ReviewGrade.again,
      mode: PracticeMode.flip,
      wasCorrect: false,
    );
    cards = await store.cardsForDeck(deckId);
    expect(levelOf(cards, 'egy'), 3);
    expect((await store.deckById(deckId))!.masteredCount, 0);

    // Sok rontás után sem megy 0 alá.
    for (var i = 0; i < 10; i++) {
      await store.recordReview(
        card: first,
        grade: ReviewGrade.again,
        mode: PracticeMode.flip,
        wasCorrect: false,
      );
    }
    cards = await store.cardsForDeck(deckId);
    expect(levelOf(cards, 'egy'), 0);

    // A hozzá nem nyúlt kártya 0-n marad.
    expect(levelOf(cards, 'kettő'), 0);
    expect(deck.cardCount, 2);
  });
}
