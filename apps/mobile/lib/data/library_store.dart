import 'dart:convert';

import 'package:collection/collection.dart';
import 'package:drift/drift.dart';
import 'package:leardy/data/local/database.dart';
import 'package:leardy/data/seed/catalog.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/domain/srs.dart';
import 'package:leardy/domain/streak.dart';
import 'package:uuid/uuid.dart';

class LibraryStore {
  LibraryStore(this.db);

  final LeardyDatabase db;
  final _uuid = const Uuid();

  Future<void> seedIfEmpty() async {
    final existing = await db.select(db.subjects).get();
    await ensureFixedSubjects();
    if (existing.isEmpty) {
      final now = DateTime.now().millisecondsSinceEpoch;
      final subjects = await (db.select(
        db.subjects,
      )..where((s) => s.deleted.equals(false))).get();
      await db.transaction(() async {
        for (final subject in seedCatalog) {
          final subjectId =
              subjects
                  .where((row) => row.name == subject.name)
                  .firstOrNull
                  ?.id ??
              await createSubject(
                name: subject.name,
                colorKey: subject.colorKey,
              );
          for (final deck in subject.decks) {
            final deckId = _uuid.v4();
            await db
                .into(db.decks)
                .insert(
                  DecksCompanion.insert(
                    id: deckId,
                    subjectId: subjectId,
                    name: deck.name,
                    description: Value(deck.description),
                    createdAt: now,
                    updatedAt: now,
                    syncStatus: const Value('clean'),
                  ),
                );
            var order = 0;
            for (final card in deck.cards) {
              final cardId = _uuid.v4();
              await db
                  .into(db.cards)
                  .insert(
                    CardsCompanion.insert(
                      id: cardId,
                      deckId: deckId,
                      front: card.front,
                      back: card.back,
                      hint: Value(card.hint),
                      example: Value(card.example),
                      sortOrder: Value(order++),
                      createdAt: now,
                      updatedAt: now,
                      syncStatus: const Value('clean'),
                    ),
                  );
              await db
                  .into(db.cardSchedules)
                  .insert(
                    CardSchedulesCompanion.insert(
                      cardId: cardId,
                      dueAt: now,
                      updatedAt: now,
                    ),
                  );
            }
          }
        }
      });
    }
    await seedBundlesIfEmpty();
  }

  Future<void> ensureFixedSubjects() async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.transaction(() async {
      var rows = await db.select(db.subjects).get();
      final byName = {for (final row in rows) row.name.toLowerCase(): row};
      for (final entry in subjectRenames.entries) {
        final old = byName[entry.key];
        if (old == null || old.name == entry.value) continue;
        final existingTarget = byName[entry.value.toLowerCase()];
        if (existingTarget != null && existingTarget.id != old.id) continue;
        await (db.update(db.subjects)..where((s) => s.id.equals(old.id))).write(
          SubjectsCompanion(name: Value(entry.value), updatedAt: Value(now)),
        );
        await (db.update(
          db.bundles,
        )..where((b) => b.subject.equals(old.name))).write(
          BundlesCompanion(subject: Value(entry.value), updatedAt: Value(now)),
        );
        byName[entry.value.toLowerCase()] = old;
      }

      // Migráció: magyar nevek -> stabil subject ID-k (pl. 'Angol' -> 'angol').
      rows = await db.select(db.subjects).get();
      for (final row in rows) {
        final id = subjectIdForName(row.name);
        final isKnownHu = subjectDefs.any(
          (def) =>
              def.huName.toLowerCase() == row.name.trim().toLowerCase() ||
              subjectRenames[row.name.trim().toLowerCase()]?.toLowerCase() ==
                  def.huName.toLowerCase(),
        );
        if (isKnownHu && row.name != id) {
          // Ha már létezik sor ezzel az ID-val, a régit eldobjuk.
          final clash = await (db.select(
            db.subjects,
          )..where((s) => s.name.equals(id))).getSingleOrNull();
          if (clash != null && clash.id != row.id) {
            await (db.delete(db.subjects)..where((s) => s.id.equals(row.id)))
                .go();
            continue;
          }
          await (db.update(
            db.subjects,
          )..where((s) => s.id.equals(row.id))).write(
            SubjectsCompanion(name: Value(id), updatedAt: Value(now)),
          );
        }
      }
      // bundles.subject migráció magyar névről ID-ra.
      final bundles = await db.select(db.bundles).get();
      for (final bundle in bundles) {
        if (bundle.subject.trim().isEmpty) continue;
        if (isSubjectId(bundle.subject)) continue;
        final mapped = subjectIdForName(bundle.subject);
        final isKnown =
            subjectDefs.any(
              (def) =>
                  def.huName.toLowerCase() ==
                  bundle.subject.trim().toLowerCase(),
            ) ||
            subjectRenames.containsKey(bundle.subject.trim().toLowerCase());
        if (isKnown) {
          await (db.update(
            db.bundles,
          )..where((b) => b.id.equals(bundle.id))).write(
            BundlesCompanion(subject: Value(mapped), updatedAt: Value(now)),
          );
        }
      }

      rows = await db.select(db.subjects).get();
      final latest = {for (final row in rows) row.name.toLowerCase(): row};
      for (var i = 0; i < subjectDefs.length; i++) {
        final item = subjectDefs[i];
        final match = latest[item.id.toLowerCase()];
        if (match == null) {
          await db
              .into(db.subjects)
              .insert(
                SubjectsCompanion.insert(
                  id: _uuid.v4(),
                  name: item.id,
                  colorKey: item.colorKey,
                  sortOrder: Value(i),
                  createdAt: now,
                  updatedAt: now,
                  syncStatus: const Value('clean'),
                ),
              );
          continue;
        }
        await (db.update(
          db.subjects,
        )..where((s) => s.id.equals(match.id))).write(
          SubjectsCompanion(
            name: Value(item.id),
            colorKey: Value(item.colorKey),
            sortOrder: Value(i),
            deleted: const Value(false),
            updatedAt: Value(now),
          ),
        );
      }
    });
  }

  Future<void> seedBundlesIfEmpty() async {
    final existing = await db.select(db.bundles).get();
    if (existing.isNotEmpty) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    final decks = await (db.select(
      db.decks,
    )..where((d) => d.deleted.equals(false))).get();
    final subjects = await (db.select(
      db.subjects,
    )..where((s) => s.deleted.equals(false))).get();
    await db.transaction(() async {
      for (final deck in decks) {
        final subjectName =
            subjects.where((s) => s.id == deck.subjectId).firstOrNull?.name ??
            '';
        final isHonfoglalas = deck.name == 'Honfoglalás';
        final bundleId = _uuid.v4();
        await db
            .into(db.bundles)
            .insert(
              BundlesCompanion.insert(
                id: bundleId,
                kind: isHonfoglalas ? 'topic' : 'skill',
                subject: subjectName,
                title: deck.name,
                status: const Value('public'),
                createdAt: now,
                updatedAt: now,
              ),
            );
        if (isHonfoglalas) {
          final lessonId = _uuid.v4();
          await db
              .into(db.lessons)
              .insert(
                LessonsCompanion.insert(
                  id: lessonId,
                  bundleId: bundleId,
                  title: honfoglalasLessonTitle,
                ),
              );
          var pageOrder = 0;
          for (final page in honfoglalasLessonPages) {
            await db
                .into(db.lessonPages)
                .insert(
                  LessonPagesCompanion.insert(
                    id: _uuid.v4(),
                    lessonId: lessonId,
                    sortOrder: Value(pageOrder++),
                    body: page.body,
                    type: Value(
                      pageOrder == 1
                          ? 'text'
                          : (pageOrder == 2 ? 'text' : 'fact'),
                    ),
                  ),
                );
          }
          final lessonTwoId = _uuid.v4();
          await db
              .into(db.lessons)
              .insert(
                LessonsCompanion.insert(
                  id: lessonTwoId,
                  bundleId: bundleId,
                  title: honfoglalasLessonTwoTitle,
                  sortOrder: const Value(1),
                ),
              );
          var secondOrder = 0;
          for (final page in honfoglalasLessonTwoPages) {
            await db
                .into(db.lessonPages)
                .insert(
                  LessonPagesCompanion.insert(
                    id: _uuid.v4(),
                    lessonId: lessonTwoId,
                    sortOrder: Value(secondOrder++),
                    body: page.body,
                    type: Value(secondOrder == 1 ? 'text' : 'fact'),
                  ),
                );
          }
          await db
              .into(db.lessonExercises)
              .insert(
                LessonExercisesCompanion.insert(
                  id: _uuid.v4(),
                  lessonId: lessonId,
                  type: 'choice',
                  prompt: 'Mikor történt a honfoglalás?',
                  answer: const Value('9. század vége'),
                  payloadJson: Value(
                    jsonEncode({
                      'options': ['9. század vége', '1241', '1526', '1000'],
                    }),
                  ),
                ),
              );
          await db
              .into(db.lessonExercises)
              .insert(
                LessonExercisesCompanion.insert(
                  id: _uuid.v4(),
                  lessonId: lessonId,
                  type: 'flip',
                  prompt: 'Honfoglalás vezetője',
                  answer: const Value('Árpád'),
                  sortOrder: const Value(1),
                ),
              );
          final mapActivityId = _uuid.v4();
          await db
              .into(db.activities)
              .insert(
                ActivitiesCompanion.insert(
                  id: mapActivityId,
                  bundleId: bundleId,
                  type: 'map',
                  title: 'Vaktérkép',
                  sortOrder: const Value(1),
                ),
              );
          await db
              .into(db.mapItems)
              .insert(
                MapItemsCompanion.insert(
                  id: _uuid.v4(),
                  activityId: mapActivityId,
                  hotspotsJson: jsonEncode(honfoglalasHotspots),
                ),
              );
        }
        await db
            .into(db.activities)
            .insert(
              ActivitiesCompanion.insert(
                id: _uuid.v4(),
                bundleId: bundleId,
                type: 'cards',
                title: 'Kártyák',
                setId: Value(deck.id),
              ),
            );
      }
    });
  }

  Stream<List<SubjectView>> watchSubjects() {
    return db.select(db.subjects).watch().asyncMap((rows) async {
      final views = <SubjectView>[];
      for (final row in rows.where((r) => !r.deleted)) {
        final decks =
            await (db.select(db.decks)..where(
                  (d) => d.subjectId.equals(row.id) & d.deleted.equals(false),
                ))
                .get();
        views.add(
          SubjectView(
            id: row.id,
            name: row.name,
            colorKey: row.colorKey,
            deckCount: decks.length,
            category: categoryForSubject(row.name),
          ),
        );
      }
      final order = {
        for (var i = 0; i < rows.length; i++) rows[i].id: rows[i].sortOrder,
      };
      views.sort((a, b) {
        final byOrder = (order[a.id] ?? 0).compareTo(order[b.id] ?? 0);
        if (byOrder != 0) return byOrder;
        return subjectOrderFor(a.name).compareTo(subjectOrderFor(b.name));
      });
      return views;
    });
  }

  Stream<List<DeckView>> watchDecks(String subjectId) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (db.select(db.decks)..where(
          (d) => d.subjectId.equals(subjectId) & d.deleted.equals(false),
        ))
        .watch()
        .asyncMap((decks) async {
          final views = <DeckView>[];
          for (final deck in decks) {
            final cards =
                await (db.select(db.cards)..where(
                      (c) => c.deckId.equals(deck.id) & c.deleted.equals(false),
                    ))
                    .get();
            views.add(await _deckView(deck, cards, now));
          }
          return views;
        });
  }

  Stream<List<DeckView>> watchAllDecks() {
    return (db.select(
      db.decks,
    )..where((d) => d.deleted.equals(false))).watch().asyncMap((decks) async {
      final now = DateTime.now().millisecondsSinceEpoch;
      final subjects = {
        for (final row in await (db.select(
          db.subjects,
        )..where((s) => s.deleted.equals(false))).get())
          row.id: row.name,
      };
      final views = <DeckView>[];
      for (final deck in decks) {
        final cards =
            await (db.select(db.cards)..where(
                  (c) => c.deckId.equals(deck.id) & c.deleted.equals(false),
                ))
                .get();
        views.add(
          await _deckView(
            deck,
            cards,
            now,
            subjectName: subjects[deck.subjectId] ?? '',
          ),
        );
      }
      views.sort(
        (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
      );
      return views;
    });
  }

  Future<DeckView?> deckById(String id) async {
    final deck =
        await (db.select(db.decks)
              ..where((d) => d.id.equals(id) & d.deleted.equals(false)))
            .getSingleOrNull();
    if (deck == null) return null;
    final now = DateTime.now().millisecondsSinceEpoch;
    final cards = await (db.select(
      db.cards,
    )..where((c) => c.deckId.equals(deck.id) & c.deleted.equals(false))).get();
    final subject = await (db.select(
      db.subjects,
    )..where((s) => s.id.equals(deck.subjectId))).getSingleOrNull();
    return _deckView(deck, cards, now, subjectName: subject?.name ?? '');
  }

  bool _cardIsDue(CardSchedule? schedule, int now) =>
      schedule == null || schedule.dueAt <= now;

  /// Megtanulva: a szint-számláló elérte a 4-et (0-ról indul,
  /// helyes +1, rontott -1).
  bool _isLearned(CardSchedule? schedule) =>
      schedule != null && schedule.level >= 4;

  Future<Map<String, CardSchedule>> _scheduleMap() async {
    final rows = await db.select(db.cardSchedules).get();
    return {for (final row in rows) row.cardId: row};
  }

  Future<DeckView> _deckView(
    dynamic deck,
    List<dynamic> cards,
    int now, {
    String subjectName = '',
    Map<String, CardSchedule>? schedules,
  }) async {
    final byCard = schedules ?? await _scheduleMap();
    var due = 0;
    var fresh = 0;
    var mastered = 0;
    for (final card in cards) {
      final schedule = byCard[card.id as String];
      if (_cardIsDue(schedule, now)) due += 1;
      if (schedule == null || schedule.state.toLowerCase() == 'new') fresh += 1;
      if (_isLearned(schedule)) mastered += 1;
    }
    return DeckView(
      id: deck.id as String,
      subjectId: deck.subjectId as String,
      name: deck.name as String,
      description: deck.description as String,
      cardCount: cards.length,
      dueCount: due,
      newCount: fresh,
      masteredCount: mastered,
      subjectName: subjectName,
      ownerUserId: deck.ownerUserId as String?,
      sourceClassId: deck.sourceClassId as String?,
      sourceSetId: deck.sourceSetId as String?,
      access: (deck.access as String?) ?? 'owner',
    );
  }

  Future<String> _subjectIdForName(String name) async {
    final normalized = subjectIdForName(name);
    final subjects = await (db.select(
      db.subjects,
    )..where((s) => s.deleted.equals(false))).get();
    final match = subjects
        .where((s) => s.name.toLowerCase() == normalized)
        .firstOrNull;
    if (match != null) return match.id;
    final other = subjects
        .where((s) => s.name.toLowerCase() == SubjectIds.egyeb)
        .firstOrNull;
    if (other != null) return other.id;
    await ensureFixedSubjects();
    final again = await (db.select(
      db.subjects,
    )..where((s) => s.deleted.equals(false))).get();
    return again
            .where((s) => s.name.toLowerCase() == SubjectIds.egyeb)
            .firstOrNull
            ?.id ??
        await createSubject(name: SubjectIds.egyeb);
  }

  Future<String> createSubject({
    required String name,
    String colorKey = 'teal',
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final id = _uuid.v4();
    await db
        .into(db.subjects)
        .insert(
          SubjectsCompanion.insert(
            id: id,
            name: name.trim(),
            colorKey: colorKey,
            createdAt: now,
            updatedAt: now,
            syncStatus: const Value('pending'),
          ),
        );
    return id;
  }

  Future<String> createDeck({
    required String subjectId,
    required String name,
    String? ownerUserId,
    String description = '',
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final id = _uuid.v4();
    await db
        .into(db.decks)
        .insert(
          DecksCompanion.insert(
            id: id,
            subjectId: subjectId,
            name: name.trim(),
            description: Value(description),
            ownerUserId: Value(ownerUserId),
            access: const Value('owner'),
            createdAt: now,
            updatedAt: now,
            syncStatus: const Value('pending'),
          ),
        );
    return id;
  }

  Future<void> updateDeck({
    required String id,
    String? name,
    String? subjectId,
    String? description,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (db.update(db.decks)..where((d) => d.id.equals(id))).write(
      DecksCompanion(
        name: name == null ? const Value.absent() : Value(name.trim()),
        subjectId: subjectId == null ? const Value.absent() : Value(subjectId),
        description: description == null
            ? const Value.absent()
            : Value(description),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
    final activity =
        (await (db.select(
              db.activities,
            )..where((a) => a.setId.equals(id) & a.type.equals('cards'))).get())
            .firstOrNull;
    if (activity == null) return;
    final bundle = await (db.select(
      db.bundles,
    )..where((b) => b.id.equals(activity.bundleId))).getSingleOrNull();
    if (bundle == null || bundle.kind != 'skill') return;
    String? subjectName;
    if (subjectId != null) {
      final subject = await (db.select(
        db.subjects,
      )..where((s) => s.id.equals(subjectId))).getSingleOrNull();
      subjectName = subject?.name;
    }
    await (db.update(db.bundles)..where((b) => b.id.equals(bundle.id))).write(
      BundlesCompanion(
        title: name == null ? const Value.absent() : Value(name.trim()),
        subject: subjectName == null
            ? const Value.absent()
            : Value(subjectName),
        updatedAt: Value(now),
      ),
    );
  }

  Future<BundleView?> bundleForDeck(String deckId, String userId) async {
    final activity =
        (await (db.select(db.activities)..where(
                  (a) => a.setId.equals(deckId) & a.type.equals('cards'),
                ))
                .get())
            .firstOrNull;
    if (activity == null) return null;
    return bundleById(activity.bundleId, userId);
  }

  Future<void> deleteDeck(String id) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (db.update(db.decks)..where((d) => d.id.equals(id))).write(
      DecksCompanion(
        deleted: const Value(true),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
  }

  Future<String> upsertCard({
    String? id,
    required String deckId,
    required String front,
    required String back,
    String? hint,
    String? example,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final cardId = id ?? _uuid.v4();
    final existing = id == null
        ? null
        : await (db.select(
            db.cards,
          )..where((c) => c.id.equals(cardId))).getSingleOrNull();
    final order =
        existing?.sortOrder ??
        ((await (db.select(db.cards)..where(
                  (c) => c.deckId.equals(deckId) & c.deleted.equals(false),
                ))
                .get())
            .length);
    await db
        .into(db.cards)
        .insertOnConflictUpdate(
          CardsCompanion.insert(
            id: cardId,
            deckId: deckId,
            front: front.trim(),
            back: back.trim(),
            hint: Value(hint?.trim().isEmpty == true ? null : hint?.trim()),
            example: Value(
              example?.trim().isEmpty == true ? null : example?.trim(),
            ),
            sortOrder: Value(order),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            syncStatus: const Value('pending'),
          ),
        );
    if (existing == null) {
      await db
          .into(db.cardSchedules)
          .insertOnConflictUpdate(
            CardSchedulesCompanion.insert(
              cardId: cardId,
              dueAt: now,
              updatedAt: now,
            ),
          );
    }
    await (db.update(db.decks)..where((d) => d.id.equals(deckId))).write(
      DecksCompanion(updatedAt: Value(now), syncStatus: const Value('pending')),
    );
    return cardId;
  }

  Future<void> deleteCard(String id) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final card = await (db.select(
      db.cards,
    )..where((c) => c.id.equals(id))).getSingleOrNull();
    await (db.update(db.cards)..where((c) => c.id.equals(id))).write(
      CardsCompanion(
        deleted: const Value(true),
        updatedAt: Value(now),
        syncStatus: const Value('pending'),
      ),
    );
    if (card != null) {
      await (db.update(db.decks)..where((d) => d.id.equals(card.deckId))).write(
        DecksCompanion(
          updatedAt: Value(now),
          syncStatus: const Value('pending'),
        ),
      );
    }
  }

  Future<void> importClassSet({
    required String classId,
    required ClassSet set,
    required List<ClassCard> cards,
    required String access,
    String? ownerUserId,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final existing =
        await (db.select(db.decks)..where(
              (d) => d.sourceSetId.equals(set.id) & d.deleted.equals(false),
            ))
            .getSingleOrNull();
    var subjectId = existing?.subjectId;
    subjectId ??= await _subjectIdForName(set.subject);
    final deckId = existing?.id ?? _uuid.v4();
    await db
        .into(db.decks)
        .insertOnConflictUpdate(
          DecksCompanion.insert(
            id: deckId,
            subjectId: subjectId,
            name: set.name,
            ownerUserId: Value(ownerUserId),
            sourceClassId: Value(classId),
            sourceSetId: Value(set.id),
            access: Value(access),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            syncStatus: const Value('clean'),
          ),
        );
    final oldCards = await (db.select(
      db.cards,
    )..where((c) => c.deckId.equals(deckId))).get();
    for (final old in oldCards) {
      await (db.update(db.cards)..where((c) => c.id.equals(old.id))).write(
        CardsCompanion(deleted: const Value(true), updatedAt: Value(now)),
      );
    }
    var order = 0;
    for (final card in cards) {
      final cardId = _uuid.v4();
      await db
          .into(db.cards)
          .insert(
            CardsCompanion.insert(
              id: cardId,
              deckId: deckId,
              front: card.front,
              back: card.back,
              hint: Value(card.hint),
              example: Value(card.example),
              sortOrder: Value(order++),
              createdAt: now,
              updatedAt: now,
              syncStatus: const Value('clean'),
            ),
          );
      await db
          .into(db.cardSchedules)
          .insert(
            CardSchedulesCompanion.insert(
              cardId: cardId,
              dueAt: now,
              updatedAt: now,
            ),
          );
    }
  }

  Future<List<CardView>> cardsForDeck(String deckId) async {
    final cards = await (db.select(
      db.cards,
    )..where((c) => c.deckId.equals(deckId) & c.deleted.equals(false))).get();
    cards.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final views = <CardView>[];
    for (final card in cards) {
      final schedule = await (db.select(
        db.cardSchedules,
      )..where((s) => s.cardId.equals(card.id))).getSingleOrNull();
      views.add(
        CardView(
          id: card.id,
          deckId: card.deckId,
          front: card.front,
          back: card.back,
          hint: card.hint,
          example: card.example,
          dueAt: schedule?.dueAt ?? 0,
          state: schedule?.state ?? 'new',
          difficulty: schedule?.difficulty ?? 0,
          reps: schedule?.reps ?? 0,
          level: schedule?.level ?? 0,
        ),
      );
    }
    return views;
  }

  /// Keresés az összes kártya elején/hátulján/tippjében.
  Future<List<({CardView card, String deckId, String deckName})>> searchCards(
    String query, {
    int limit = 50,
  }) async {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return [];
    final decks = {
      for (final row in await db.select(db.decks).get()) row.id: row,
    };
    final schedules = await _scheduleMap();
    final out = <({CardView card, String deckId, String deckName})>[];
    final rows = await (db.select(
      db.cards,
    )..where((c) => c.deleted.equals(false))).get();
    for (final row in rows) {
      final deck = decks[row.deckId];
      if (deck == null || deck.deleted) continue;
      final haystack =
          '${row.front}\n${row.back}\n${row.hint ?? ''}'.toLowerCase();
      if (!haystack.contains(q)) continue;
      final schedule = schedules[row.id];
      out.add((
        card: CardView(
          id: row.id,
          deckId: row.deckId,
          front: row.front,
          back: row.back,
          hint: row.hint,
          example: row.example,
          dueAt: schedule?.dueAt ?? 0,
          state: schedule?.state ?? 'new',
          difficulty: schedule?.difficulty ?? 0,
          reps: schedule?.reps ?? 0,
          level: schedule?.level ?? 0,
        ),
        deckId: row.deckId,
        deckName: deck.name,
      ));
      if (out.length >= limit) break;
    }
    out.sort((a, b) {
      final aStarts = a.card.front.toLowerCase().startsWith(q) ? 0 : 1;
      final bStarts = b.card.front.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts != bStarts) return aStarts.compareTo(bStarts);
      final byDeck = a.deckName.toLowerCase().compareTo(
        b.deckName.toLowerCase(),
      );
      return byDeck != 0
          ? byDeck
          : a.card.front.toLowerCase().compareTo(b.card.front.toLowerCase());
    });
    return out;
  }

  Future<List<CardView>> dueQueue({String? deckId, int limit = 24}) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final query =
        db.select(db.cards).join([
          leftOuterJoin(
            db.cardSchedules,
            db.cardSchedules.cardId.equalsExp(db.cards.id),
          ),
          innerJoin(db.decks, db.decks.id.equalsExp(db.cards.deckId)),
        ])..where(
          db.cards.deleted.equals(false) &
              (db.cardSchedules.dueAt.isNull() |
                  db.cardSchedules.dueAt.isSmallerOrEqualValue(now)),
        );
    if (deckId != null) {
      query.where(db.cards.deckId.equals(deckId));
    }
    query.limit(limit);
    final rows = await query.get();
    return rows.map((row) {
      final card = row.readTable(db.cards);
      final schedule = row.readTableOrNull(db.cardSchedules);
      return CardView(
        id: card.id,
        deckId: card.deckId,
        front: card.front,
        back: card.back,
        hint: card.hint,
        example: card.example,
        dueAt: schedule?.dueAt ?? 0,
        state: schedule?.state ?? 'new',
        difficulty: schedule?.difficulty ?? 0,
        reps: schedule?.reps ?? 0,
        level: schedule?.level ?? 0,
      );
    }).toList();
  }

  Stream<HomeSnapshot> watchHome() async* {
    yield await home();
    await for (final _ in db.select(db.cardSchedules).watch().skip(1)) {
      yield await home();
    }
  }

  Future<HomeSnapshot> home() async {
    final due = await dueQueue(limit: 200);
    final activities = await db.select(db.dailyActivities).get();
    final byDate = {for (final row in activities) row.date: row.cardsReviewed};
    final dates = activities
        .where((a) => a.cardsReviewed > 0)
        .map((a) => a.date);
    final today = formatDay(DateTime.now());
    final subjects = await (db.select(
      db.subjects,
    )..where((s) => s.deleted.equals(false))).get();
    final dueDecks = <DeckView>[];
    final now = DateTime.now().millisecondsSinceEpoch;
    final schedules = await _scheduleMap();
    for (final subject in subjects) {
      final decks =
          await (db.select(db.decks)..where(
                (d) => d.subjectId.equals(subject.id) & d.deleted.equals(false),
              ))
              .get();
      for (final deck in decks) {
        final cards =
            await (db.select(db.cards)..where(
                  (c) => c.deckId.equals(deck.id) & c.deleted.equals(false),
                ))
                .get();
        var dueCount = 0;
        var fresh = 0;
        var mastered = 0;
        for (final card in cards) {
          final schedule = schedules[card.id];
          if (_cardIsDue(schedule, now)) dueCount += 1;
          if (schedule == null || schedule.state.toLowerCase() == 'new') {
            fresh += 1;
          }
          if (_isLearned(schedule)) mastered += 1;
        }
        if (dueCount > 0) {
          dueDecks.add(
            DeckView(
              id: deck.id,
              subjectId: deck.subjectId,
              name: deck.name,
              description: deck.description,
              cardCount: cards.length,
              dueCount: dueCount,
              newCount: fresh,
              masteredCount: mastered,
            ),
          );
        }
      }
    }
    dueDecks.sort((a, b) => b.dueCount.compareTo(a.dueCount));
    final continueBundle = await _continueLesson();
    return HomeSnapshot(
      dueToday: due.length,
      streak: streakFromDates(dates),
      reviewedToday: byDate[today] ?? 0,
      last28: last28Counts(byDate),
      dueDecks: dueDecks.take(6).toList(),
      continueBundle: continueBundle?.$1,
      continueLessonId: continueBundle?.$2,
    );
  }

  Future<(BundleView, String)?> _continueLesson() async {
    final saved = await listSavedBundles('local');
    for (final bundle in saved.where((b) => b.canLearn)) {
      final lessonId = bundle.incompleteLessonId ?? bundle.firstLessonId;
      if (lessonId != null) return (bundle, lessonId);
    }
    return null;
  }

  Future<void> recordReview({
    required CardView card,
    required ReviewGrade grade,
    required PracticeMode mode,
    required bool wasCorrect,
    int? elapsedMs,
  }) async {
    final now = DateTime.now();
    final schedule = await (db.select(
      db.cardSchedules,
    )..where((s) => s.cardId.equals(card.id))).getSingleOrNull();
    final next = scheduleReview(
      storedJson: schedule?.fsrsJson,
      grade: grade,
      now: now.toUtc(),
    );
    // Szint-számláló: 0-ról indul, helyes +1, rontott -1 (0 és 4 között).
    final nextLevel = ((schedule?.level ?? 0) + (wasCorrect ? 1 : -1)).clamp(
      0,
      4,
    );
    await db.transaction(() async {
      await db
          .into(db.cardSchedules)
          .insertOnConflictUpdate(
            CardSchedulesCompanion(
              cardId: Value(card.id),
              state: Value(next.state.toLowerCase()),
              dueAt: Value(next.dueAt),
              stability: Value(next.stability),
              difficulty: Value(next.difficulty),
              reps: Value((schedule?.reps ?? 0) + 1),
              lapses: Value((schedule?.lapses ?? 0) + (next.again ? 1 : 0)),
              lastReviewedAt: Value(now.millisecondsSinceEpoch),
              fsrsJson: Value(next.fsrsJson),
              level: Value(nextLevel),
              updatedAt: Value(now.millisecondsSinceEpoch),
            ),
          );
      await db
          .into(db.reviewLogs)
          .insert(
            ReviewLogsCompanion.insert(
              id: _uuid.v4(),
              cardId: card.id,
              reviewedAt: now.millisecondsSinceEpoch,
              rating: grade.name,
              mode: mode.name,
              wasCorrect: wasCorrect,
              elapsedMs: Value(elapsedMs),
            ),
          );
      await db
          .into(db.outboxItems)
          .insert(
            OutboxItemsCompanion.insert(
              id: _uuid.v4(),
              entityType: 'review',
              entityId: card.id,
              operation: 'create',
              payloadJson: '{"cardId":"${card.id}","rating":"${grade.name}"}',
              createdAt: now.millisecondsSinceEpoch,
            ),
          );
      final day = formatDay(now);
      final existing = await (db.select(
        db.dailyActivities,
      )..where((d) => d.date.equals(day))).getSingleOrNull();
      if (existing == null) {
        await db
            .into(db.dailyActivities)
            .insert(
              DailyActivitiesCompanion.insert(
                date: day,
                cardsReviewed: const Value(1),
              ),
            );
      } else {
        await (db.update(
          db.dailyActivities,
        )..where((d) => d.date.equals(day))).write(
          DailyActivitiesCompanion(
            cardsReviewed: Value(existing.cardsReviewed + 1),
          ),
        );
      }
    });
  }

  Future<String> setting(String key, [String fallback = '']) async {
    final row = await (db.select(
      db.appSettings,
    )..where((s) => s.key.equals(key))).getSingleOrNull();
    return row?.value ?? fallback;
  }

  Future<void> setSetting(String key, String value) async {
    await db
        .into(db.appSettings)
        .insertOnConflictUpdate(
          AppSettingsCompanion(key: Value(key), value: Value(value)),
        );
  }

  static const _classCacheKey = 'cache_classes_v1';
  static String _classDetailKey(String classId) => 'cache_class_detail_$classId';

  Future<void> cacheClassrooms(List<Classroom> items) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await setSetting(
      _classCacheKey,
      jsonEncode({
        'updatedAt': now,
        'classes': [
          for (final c in items)
            {
              'id': c.id,
              'name': c.name,
              'role': c.role,
              'allowStudentSets': c.allowStudentSets,
              'memberCount': c.memberCount,
              'ownerId': c.ownerId,
              'joinCode': c.joinCode,
              'activeQuizId': c.activeQuizId,
              'activeQuizStatus': c.activeQuizStatus,
            },
        ],
      }),
    );
  }

  Future<({List<Classroom> items, DateTime? updatedAt})> cachedClassrooms() async {
    final raw = await setting(_classCacheKey);
    if (raw.isEmpty) {
      return (items: const <Classroom>[], updatedAt: null);
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        return (items: const <Classroom>[], updatedAt: null);
      }
      final list = decoded['classes'];
      if (list is! List) {
        return (items: const <Classroom>[], updatedAt: null);
      }
      return (
        items: [
          for (final item in list)
            if (item is Map)
              Classroom(
                id: item['id'] as String? ?? '',
                name: item['name'] as String? ?? '',
                role: item['role'] as String? ?? 'student',
                allowStudentSets: item['allowStudentSets'] == true,
                memberCount: (item['memberCount'] as num?)?.toInt() ?? 0,
                ownerId: item['ownerId'] as String?,
                joinCode: item['joinCode'] as String?,
                activeQuizId: item['activeQuizId'] as String?,
                activeQuizStatus: item['activeQuizStatus'] as String?,
              ),
        ],
        updatedAt: decoded['updatedAt'] is num
            ? DateTime.fromMillisecondsSinceEpoch(
                (decoded['updatedAt'] as num).toInt(),
              )
            : null,
      );
    } catch (_) {
      return (items: const <Classroom>[], updatedAt: null);
    }
  }

  Future<void> cacheClassDetail(
    String classId, {
    required List<ClassSet> sets,
    required List<ClassMaterial> materials,
  }) async {
    await setSetting(
      _classDetailKey(classId),
      jsonEncode({
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
        'sets': [
          for (final s in sets)
            {
              'id': s.id,
              'name': s.name,
              'subject': s.subject,
              'ownerId': s.ownerId,
              'myRole': s.myRole,
              'createdAt': s.createdAt,
            },
        ],
        'materials': [
          for (final m in materials)
            {
              'id': m.id,
              'title': m.title,
              'url': m.url,
              'note': m.note,
              'createdBy': m.createdBy,
              'createdAt': m.createdAt,
            },
        ],
      }),
    );
  }

  Future<({List<ClassSet> sets, List<ClassMaterial> materials})>
  cachedClassDetail(String classId) async {
    final raw = await setting(_classDetailKey(classId));
    if (raw.isEmpty) {
      return (sets: const <ClassSet>[], materials: const <ClassMaterial>[]);
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        return (sets: const <ClassSet>[], materials: const <ClassMaterial>[]);
      }
      final sets = decoded['sets'];
      final materials = decoded['materials'];
      return (
        sets: [
          if (sets is List)
            for (final item in sets)
              if (item is Map)
                ClassSet(
                  id: item['id'] as String? ?? '',
                  name: item['name'] as String? ?? '',
                  subject: item['subject'] as String? ?? '',
                  ownerId: item['ownerId'] as String?,
                  myRole: item['myRole'] as String? ?? 'reader',
                  createdAt: item['createdAt'] as String?,
                ),
        ],
        materials: [
          if (materials is List)
            for (final item in materials)
              if (item is Map)
                ClassMaterial(
                  id: item['id'] as String? ?? '',
                  title: item['title'] as String? ?? '',
                  url: item['url'] as String?,
                  note: item['note'] as String?,
                  createdBy: item['createdBy'] as String?,
                  createdAt: item['createdAt'] as String?,
                ),
        ],
      );
    } catch (_) {
      return (sets: const <ClassSet>[], materials: const <ClassMaterial>[]);
    }
  }

  static const recentSubjectsKey = 'recentSubjects';

  Future<List<String>> recentSubjectIds() async {
    final raw = await setting(recentSubjectsKey);
    if (raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded.whereType<String>().toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> touchRecentSubject(String id) async {
    final current = await recentSubjectIds();
    final next = [id, ...current.where((item) => item != id)].take(5).toList();
    await setSetting(recentSubjectsKey, jsonEncode(next));
  }

  Future<List<Map<String, dynamic>>> exportChanges() async {
    final changes = <Map<String, dynamic>>[];
    final subjectRows = await (db.select(
      db.subjects,
    )..where((s) => s.syncStatus.equals('pending'))).get();
    for (final row in subjectRows) {
      changes.add(
        _change(
          'subject',
          row.id,
          row.updatedAt,
          {
            'id': row.id,
            'name': row.name,
            'colorKey': row.colorKey,
            'description': row.description,
            'updatedAt': _iso(row.updatedAt),
          },
          deleted: row.deleted,
          deletedAt: row.updatedAt,
        ),
      );
    }
    final deckRows = await (db.select(
      db.decks,
    )..where((d) => d.syncStatus.equals('pending'))).get();
    for (final row in deckRows) {
      changes.add(
        _change(
          'deck',
          row.id,
          row.updatedAt,
          {
            'id': row.id,
            'subjectId': row.subjectId,
            'name': row.name,
            'description': row.description,
            'updatedAt': _iso(row.updatedAt),
          },
          deleted: row.deleted,
          deletedAt: row.updatedAt,
        ),
      );
    }
    final cardRows = await (db.select(
      db.cards,
    )..where((c) => c.syncStatus.equals('pending'))).get();
    for (final row in cardRows) {
      changes.add(
        _change(
          'card',
          row.id,
          row.updatedAt,
          {
            'id': row.id,
            'deckId': row.deckId,
            'front': row.front,
            'back': row.back,
            'hint': row.hint,
            'example': row.example,
            'updatedAt': _iso(row.updatedAt),
          },
          deleted: row.deleted,
          deletedAt: row.updatedAt,
        ),
      );
    }
    for (final row in await db.select(db.cardSchedules).get()) {
      changes.add(
        _change(
          'cardSchedule',
          row.cardId,
          row.updatedAt,
          {
            'id': row.cardId,
            'cardId': row.cardId,
            'dueAt': _iso(row.dueAt),
            'state': row.state,
            'stability': row.stability,
            'difficulty': row.difficulty,
            'reps': row.reps,
            'lapses': row.lapses,
            'fsrsJson': row.fsrsJson,
            'level': row.level,
            'updatedAt': _iso(row.updatedAt),
          },
          deleted: false,
          deletedAt: row.updatedAt,
        ),
      );
    }
    for (final row in await db.select(db.reviewLogs).get()) {
      changes.add(
        _change(
          'reviewLog',
          row.id,
          row.reviewedAt,
          {
            'id': row.id,
            'cardId': row.cardId,
            'reviewedAt': _iso(row.reviewedAt),
            'rating': row.rating,
            'mode': row.mode,
            'wasCorrect': row.wasCorrect,
            'elapsedMs': row.elapsedMs,
            'updatedAt': _iso(row.reviewedAt),
          },
          deleted: false,
          deletedAt: row.reviewedAt,
        ),
      );
    }
    for (final row in await db.select(db.dailyActivities).get()) {
      final stamp = DateTime.utc(1970).add(
        Duration(
          days: row.date.hashCode.abs() % 20000,
          seconds: row.cardsReviewed,
        ),
      );
      changes.add(
        _change(
          'dailyActivity',
          row.date,
          row.cardsReviewed,
          {
            'id': row.date,
            'date': row.date,
            'cardsReviewed': row.cardsReviewed,
            'studyTimeSeconds': row.studyTimeSeconds,
            'updatedAt': stamp.toIso8601String(),
          },
          deleted: false,
          deletedAt: row.cardsReviewed,
        ),
      );
    }
    return changes;
  }

  Future<void> markAccepted(List<dynamic> accepted) async {
    for (final raw in accepted) {
      if (raw is! Map) continue;
      final entity = raw['entity'] as String?;
      final payload = raw['payload'] is Map
          ? Map<String, dynamic>.from(raw['payload'] as Map)
          : const <String, dynamic>{};
      final id = payload['id'] as String? ?? raw['clientId'] as String?;
      if (entity == null || id == null) continue;
      switch (entity) {
        case 'subject':
          await (db.update(db.subjects)..where((s) => s.id.equals(id))).write(
            const SubjectsCompanion(syncStatus: Value('clean')),
          );
        case 'deck':
          await (db.update(db.decks)..where((d) => d.id.equals(id))).write(
            const DecksCompanion(syncStatus: Value('clean')),
          );
        case 'card':
          await (db.update(db.cards)..where((c) => c.id.equals(id))).write(
            const CardsCompanion(syncStatus: Value('clean')),
          );
      }
    }
  }

  Future<void> clearOutbox() async {
    await db.delete(db.outboxItems).go();
  }

  Future<void> applyRemoteChanges(List<Map<String, dynamic>> changes) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.transaction(() async {
      for (final change in changes) {
        final entity = change['entity'] as String?;
        if (change['payload'] is! Map) continue;
        final payload = Map<String, dynamic>.from(change['payload'] as Map);
        final id = payload['id'] as String? ?? change['clientId'] as String?;
        if (entity == null || id == null) continue;
        final deleted = change['deletedAt'] != null;
        final updatedAt = _millis(payload['updatedAt']) ?? now;
        switch (entity) {
          case 'subject':
            {
              final existing = await (db.select(
                db.subjects,
              )..where((s) => s.id.equals(id))).getSingleOrNull();
              if (existing != null && existing.updatedAt >= updatedAt) continue;
              await db
                  .into(db.subjects)
                  .insertOnConflictUpdate(
                    SubjectsCompanion.insert(
                      id: id,
                      name:
                          payload['name'] as String? ??
                          existing?.name ??
                          'Untitled',
                      description: Value(
                        payload['description'] as String? ??
                            existing?.description ??
                            '',
                      ),
                      colorKey:
                          payload['colorKey'] as String? ??
                          existing?.colorKey ??
                          'teal',
                      createdAt: existing?.createdAt ?? updatedAt,
                      updatedAt: updatedAt,
                      deleted: Value(deleted),
                      syncStatus: const Value('clean'),
                    ),
                  );
            }
          case 'deck':
            {
              final subjectId =
                  payload['subjectId'] as String? ??
                  payload['subject_id'] as String?;
              if (subjectId == null) continue;
              final existing = await (db.select(
                db.decks,
              )..where((d) => d.id.equals(id))).getSingleOrNull();
              if (existing != null && existing.updatedAt >= updatedAt) continue;
              await db
                  .into(db.decks)
                  .insertOnConflictUpdate(
                    DecksCompanion.insert(
                      id: id,
                      subjectId: subjectId,
                      name:
                          payload['name'] as String? ??
                          existing?.name ??
                          'Untitled',
                      description: Value(
                        payload['description'] as String? ??
                            existing?.description ??
                            '',
                      ),
                      createdAt: existing?.createdAt ?? updatedAt,
                      updatedAt: updatedAt,
                      deleted: Value(deleted),
                      syncStatus: const Value('clean'),
                    ),
                  );
            }
          case 'card':
            {
              final deckId =
                  payload['deckId'] as String? ?? payload['deck_id'] as String?;
              if (deckId == null) continue;
              final existing = await (db.select(
                db.cards,
              )..where((c) => c.id.equals(id))).getSingleOrNull();
              if (existing != null && existing.updatedAt >= updatedAt) continue;
              await db
                  .into(db.cards)
                  .insertOnConflictUpdate(
                    CardsCompanion.insert(
                      id: id,
                      deckId: deckId,
                      front:
                          payload['front'] as String? ?? existing?.front ?? '',
                      back: payload['back'] as String? ?? existing?.back ?? '',
                      hint: Value(payload['hint'] as String? ?? existing?.hint),
                      example: Value(
                        payload['example'] as String? ?? existing?.example,
                      ),
                      createdAt: existing?.createdAt ?? updatedAt,
                      updatedAt: updatedAt,
                      deleted: Value(deleted),
                      syncStatus: const Value('clean'),
                    ),
                  );
              final schedule = await (db.select(
                db.cardSchedules,
              )..where((s) => s.cardId.equals(id))).getSingleOrNull();
              if (schedule == null) {
                await db
                    .into(db.cardSchedules)
                    .insert(
                      CardSchedulesCompanion.insert(
                        cardId: id,
                        dueAt: now,
                        updatedAt: now,
                      ),
                    );
              }
            }
          case 'cardSchedule':
            {
              final cardId = payload['cardId'] as String? ?? id;
              final existing = await (db.select(
                db.cardSchedules,
              )..where((s) => s.cardId.equals(cardId))).getSingleOrNull();
              if (existing != null && existing.updatedAt >= updatedAt) continue;
              await db
                  .into(db.cardSchedules)
                  .insertOnConflictUpdate(
                    CardSchedulesCompanion.insert(
                      cardId: cardId,
                      state: Value(
                        payload['state'] as String? ?? existing?.state ?? 'new',
                      ),
                      dueAt:
                          _millis(payload['dueAt']) ?? existing?.dueAt ?? now,
                      stability: Value(
                        (payload['stability'] as num?)?.toDouble() ??
                            existing?.stability ??
                            0,
                      ),
                      difficulty: Value(
                        (payload['difficulty'] as num?)?.toDouble() ??
                            existing?.difficulty ??
                            0,
                      ),
                      reps: Value(
                        (payload['reps'] as num?)?.toInt() ??
                            existing?.reps ??
                            0,
                      ),
                      lapses: Value(
                        (payload['lapses'] as num?)?.toInt() ??
                            existing?.lapses ??
                            0,
                      ),
                      fsrsJson: Value(
                        payload['fsrsJson'] as String? ??
                            existing?.fsrsJson ??
                            '{}',
                      ),
                      level: Value(
                        (payload['level'] as num?)?.toInt() ??
                            existing?.level ??
                            0,
                      ),
                      updatedAt: updatedAt,
                    ),
                  );
            }
          case 'reviewLog':
            {
              final existing = await (db.select(
                db.reviewLogs,
              )..where((r) => r.id.equals(id))).getSingleOrNull();
              if (existing != null) continue;
              final cardId = payload['cardId'] as String?;
              if (cardId == null) continue;
              await db
                  .into(db.reviewLogs)
                  .insert(
                    ReviewLogsCompanion.insert(
                      id: id,
                      cardId: cardId,
                      reviewedAt: _millis(payload['reviewedAt']) ?? updatedAt,
                      rating: payload['rating'] as String? ?? 'good',
                      mode: payload['mode'] as String? ?? 'flip',
                      wasCorrect: payload['wasCorrect'] == true,
                      elapsedMs: Value((payload['elapsedMs'] as num?)?.toInt()),
                    ),
                  );
            }
          case 'dailyActivity':
            {
              final date = payload['date'] as String? ?? id;
              final remoteCount =
                  (payload['cardsReviewed'] as num?)?.toInt() ?? 0;
              final existing = await (db.select(
                db.dailyActivities,
              )..where((d) => d.date.equals(date))).getSingleOrNull();
              if (existing != null && existing.cardsReviewed >= remoteCount)
                continue;
              await db
                  .into(db.dailyActivities)
                  .insertOnConflictUpdate(
                    DailyActivitiesCompanion.insert(
                      date: date,
                      cardsReviewed: Value(remoteCount),
                      studyTimeSeconds: Value(
                        (payload['studyTimeSeconds'] as num?)?.toInt() ??
                            existing?.studyTimeSeconds ??
                            0,
                      ),
                    ),
                  );
            }
        }
      }
    });
  }

  Map<String, dynamic> _change(
    String entity,
    String id,
    int updatedAt,
    Map<String, dynamic> payload, {
    required bool deleted,
    required int deletedAt,
  }) {
    return {
      'entity': entity,
      'clientId': id,
      'revision': updatedAt,
      'payload': payload,
      if (deleted) 'deletedAt': _iso(deletedAt),
    };
  }

  Stream<List<BundleView>> watchSavedBundles(String userId) {
    return db
        .select(db.librarySaves)
        .watch()
        .asyncMap((_) => listSavedBundles(userId));
  }

  Stream<List<BundleView>> watchPublicBundles(String userId) {
    return db
        .select(db.bundles)
        .join([
          leftOuterJoin(
            db.librarySaves,
            db.librarySaves.bundleId.equalsExp(db.bundles.id),
          ),
        ])
        .watch()
        .asyncMap((_) => listPublicBundles(userId));
  }

  Stream<BundleView?> watchBundle(String id, String userId) {
    return db
        .select(db.bundles)
        .watch()
        .asyncMap((_) => bundleById(id, userId));
  }

  Future<List<BundleView>> listSavedBundles(String userId) async {
    final saves = await db.select(db.librarySaves).get();
    final ids = saves
        .where((s) => s.userId == userId || s.userId == 'local')
        .map((s) => s.bundleId)
        .toSet();
    final views = <BundleView>[];
    for (final id in ids) {
      final view = await bundleById(id, userId);
      if (view != null) views.add(view);
    }
    views.sort(
      (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
    );
    return views;
  }

  Future<List<BundleView>> listPublicBundles(String userId) async {
    final rows = await (db.select(
      db.bundles,
    )..where((b) => b.deleted.equals(false) & b.status.equals('public'))).get();
    final views = <BundleView>[];
    for (final row in rows) {
      final view = await bundleById(row.id, userId);
      if (view != null) views.add(view);
    }
    views.sort(
      (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
    );
    return views;
  }

  Future<BundleView?> bundleById(String id, String userId) async {
    final row =
        await (db.select(db.bundles)
              ..where((b) => b.id.equals(id) & b.deleted.equals(false)))
            .getSingleOrNull();
    if (row == null) return null;
    final lessons = await (db.select(
      db.lessons,
    )..where((l) => l.bundleId.equals(id))).get();
    final activities = await (db.select(
      db.activities,
    )..where((a) => a.bundleId.equals(id))).get();
    final saved =
        await (db.select(db.librarySaves)..where(
              (s) =>
                  s.bundleId.equals(id) &
                  (s.userId.equals(userId) | s.userId.equals('local')),
            ))
            .get();
    final cardsActivity = activities
        .where((a) => a.type == 'cards')
        .firstOrNull;
    final mapActivity = activities.where((a) => a.type == 'map').firstOrNull;
    var dueCount = 0;
    var cardCount = 0;
    if (cardsActivity?.setId != null) {
      final cards =
          await (db.select(db.cards)..where(
                (c) =>
                    c.deckId.equals(cardsActivity!.setId!) &
                    c.deleted.equals(false),
              ))
              .get();
      cardCount = cards.length;
      final now = DateTime.now().millisecondsSinceEpoch;
      final schedules = await _scheduleMap();
      for (final card in cards) {
        if (_cardIsDue(schedules[card.id], now)) dueCount += 1;
      }
    }
    lessons.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    String? incompleteLessonId;
    for (final lesson in lessons) {
      final done = await (db.select(
        db.lessonProgress,
      )..where((p) => p.lessonId.equals(lesson.id))).getSingleOrNull();
      if (done == null) {
        incompleteLessonId = lesson.id;
        break;
      }
    }
    return BundleView(
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      title: row.title,
      status: row.status,
      ownerUserId: row.ownerUserId,
      saved: saved.isNotEmpty,
      lessonCount: lessons.length,
      activityCount: activities.length,
      cardsSetId: cardsActivity?.setId,
      mapActivityId: mapActivity?.id,
      dueCount: dueCount,
      cardCount: cardCount,
      firstLessonId: lessons.firstOrNull?.id,
      incompleteLessonId: incompleteLessonId,
    );
  }

  Future<List<LessonView>> lessonsForBundle(String bundleId) async {
    final rows = await (db.select(
      db.lessons,
    )..where((l) => l.bundleId.equals(bundleId))).get();
    rows.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final views = <LessonView>[];
    for (final row in rows) {
      final pages = await (db.select(
        db.lessonPages,
      )..where((p) => p.lessonId.equals(row.id))).get();
      final done = await (db.select(
        db.lessonProgress,
      )..where((p) => p.lessonId.equals(row.id))).getSingleOrNull();
      views.add(
        LessonView(
          id: row.id,
          bundleId: bundleId,
          title: row.title,
          sortOrder: row.sortOrder,
          pageCount: pages.length,
          completed: done != null,
        ),
      );
    }
    return views;
  }

  Future<List<LessonPageView>> pagesForLesson(String lessonId) async {
    final rows = await (db.select(
      db.lessonPages,
    )..where((p) => p.lessonId.equals(lessonId))).get();
    rows.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return [
      for (final row in rows)
        LessonPageView(
          id: row.id,
          lessonId: lessonId,
          sortOrder: row.sortOrder,
          body: row.body,
          type: lessonStepTypeFrom(row.type),
          payload: _jsonMap(row.payloadJson),
        ),
    ];
  }

  Future<LessonView?> lessonById(String lessonId) async {
    final row = await (db.select(
      db.lessons,
    )..where((l) => l.id.equals(lessonId))).getSingleOrNull();
    if (row == null) return null;
    final pages = await (db.select(
      db.lessonPages,
    )..where((p) => p.lessonId.equals(lessonId))).get();
    final done = await (db.select(
      db.lessonProgress,
    )..where((p) => p.lessonId.equals(lessonId))).getSingleOrNull();
    return LessonView(
      id: row.id,
      bundleId: row.bundleId,
      title: row.title,
      sortOrder: row.sortOrder,
      pageCount: pages.length,
      completed: done != null,
    );
  }

  Future<List<ActivityView>> activitiesForBundle(String bundleId) async {
    final rows = await (db.select(
      db.activities,
    )..where((a) => a.bundleId.equals(bundleId))).get();
    rows.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return [
      for (final row in rows)
        ActivityView(
          id: row.id,
          bundleId: bundleId,
          type: row.type,
          title: row.title,
          setId: row.setId,
          serverSetId: row.serverSetId,
          sortOrder: row.sortOrder,
        ),
    ];
  }

  Future<List<MapHotspot>> hotspotsForActivity(String activityId) async {
    final row = await (db.select(
      db.mapItems,
    )..where((m) => m.activityId.equals(activityId))).getSingleOrNull();
    if (row == null) return const [];
    final raw = jsonDecode(row.hotspotsJson);
    if (raw is! List) return const [];
    return [
      for (final item in raw)
        if (item is Map) MapHotspot.fromJson(Map<String, dynamic>.from(item)),
    ];
  }

  Future<void> markLessonDone(String lessonId) async {
    await db
        .into(db.lessonProgress)
        .insertOnConflictUpdate(
          LessonProgressCompanion.insert(
            lessonId: lessonId,
            completedAt: DateTime.now().millisecondsSinceEpoch,
          ),
        );
  }

  Future<void> saveBundle(String bundleId, String userId) async {
    await db
        .into(db.librarySaves)
        .insertOnConflictUpdate(
          LibrarySavesCompanion.insert(
            bundleId: bundleId,
            userId: Value(userId),
            createdAt: DateTime.now().millisecondsSinceEpoch,
          ),
        );
  }

  Future<void> unsaveBundle(String bundleId, String userId) async {
    await (db.delete(db.librarySaves)..where(
          (s) =>
              s.bundleId.equals(bundleId) &
              (s.userId.equals(userId) | s.userId.equals('local')),
        ))
        .go();
  }

  Future<void> publishBundle(String bundleId) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (db.update(db.bundles)..where((b) => b.id.equals(bundleId))).write(
      BundlesCompanion(status: const Value('public'), updatedAt: Value(now)),
    );
  }

  Future<String> createBundle({
    required String kind,
    required String title,
    required String subject,
    String? ownerUserId,
    String status = 'draft',
    String? lessonTitle,
    String? lessonBody,
    List<({String title, String body})> lessons = const [],
    List<MapHotspot> hotspots = const [],
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final bundleId = _uuid.v4();
    final normalizedSubject = subjectIdForName(subject);
    final subjectId = await _subjectIdForName(subject);
    await db.transaction(() async {
      await db
          .into(db.bundles)
          .insert(
            BundlesCompanion.insert(
              id: bundleId,
              kind: kind,
              subject: normalizedSubject,
              title: title.trim(),
              ownerUserId: Value(ownerUserId),
              status: Value(status),
              createdAt: now,
              updatedAt: now,
            ),
          );
      if (kind != 'topic') {
        final deckId = await createDeck(
          subjectId: subjectId,
          name: title.trim(),
          ownerUserId: ownerUserId,
        );
        await db
            .into(db.activities)
            .insert(
              ActivitiesCompanion.insert(
                id: _uuid.v4(),
                bundleId: bundleId,
                type: 'cards',
                title: 'Kártyák',
                setId: Value(deckId),
              ),
            );
      }
      if (kind == 'topic') {
        final drafts = [
          ...lessons,
          if (lessons.isEmpty &&
              ((lessonTitle ?? '').trim().isNotEmpty ||
                  (lessonBody ?? '').trim().isNotEmpty))
            (title: (lessonTitle ?? title).trim(), body: lessonBody ?? ''),
        ];
        var lessonOrder = 0;
        for (final draft in drafts) {
          final name = draft.title.trim().isEmpty
              ? title.trim()
              : draft.title.trim();
          if (name.isEmpty && draft.body.trim().isEmpty) continue;
          final lessonId = _uuid.v4();
          await db
              .into(db.lessons)
              .insert(
                LessonsCompanion.insert(
                  id: lessonId,
                  bundleId: bundleId,
                  title: name.isEmpty ? title.trim() : name,
                  sortOrder: Value(lessonOrder++),
                ),
              );
          final body = draft.body.trim();
          if (body.isNotEmpty) {
            await db
                .into(db.lessonPages)
                .insert(
                  LessonPagesCompanion.insert(
                    id: _uuid.v4(),
                    lessonId: lessonId,
                    body: body,
                  ),
                );
          }
        }
        if (hotspots.isNotEmpty) {
          final mapActivityId = _uuid.v4();
          await db
              .into(db.activities)
              .insert(
                ActivitiesCompanion.insert(
                  id: mapActivityId,
                  bundleId: bundleId,
                  type: 'map',
                  title: 'Vaktérkép',
                  sortOrder: const Value(1),
                ),
              );
          await db
              .into(db.mapItems)
              .insert(
                MapItemsCompanion.insert(
                  id: _uuid.v4(),
                  activityId: mapActivityId,
                  hotspotsJson: jsonEncode([
                    for (final h in hotspots) h.toJson(),
                  ]),
                ),
              );
        }
      }
      await db
          .into(db.librarySaves)
          .insert(
            LibrarySavesCompanion.insert(
              bundleId: bundleId,
              userId: Value(ownerUserId ?? 'local'),
              createdAt: now,
            ),
          );
    });
    return bundleId;
  }

  Future<String> addLesson({
    required String bundleId,
    required String title,
    String? body,
  }) async {
    final existing = await (db.select(
      db.lessons,
    )..where((l) => l.bundleId.equals(bundleId))).get();
    final lessonId = _uuid.v4();
    await db
        .into(db.lessons)
        .insert(
          LessonsCompanion.insert(
            id: lessonId,
            bundleId: bundleId,
            title: title.trim(),
            sortOrder: Value(existing.length),
          ),
        );
    final text = body?.trim() ?? '';
    await db
        .into(db.lessonPages)
        .insert(
          LessonPagesCompanion.insert(
            id: _uuid.v4(),
            lessonId: lessonId,
            body: text,
            type: const Value('text'),
          ),
        );
    return lessonId;
  }

  Future<void> updateBundle({
    required String id,
    String? title,
    String? subject,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (db.update(db.bundles)..where((b) => b.id.equals(id))).write(
      BundlesCompanion(
        title: title == null ? const Value.absent() : Value(title.trim()),
        subject: subject == null
            ? const Value.absent()
            : Value(subjectIdForName(subject)),
        updatedAt: Value(now),
      ),
    );
  }

  Future<void> unpublishBundle(String bundleId) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await (db.update(db.bundles)..where((b) => b.id.equals(bundleId))).write(
      BundlesCompanion(status: const Value('draft'), updatedAt: Value(now)),
    );
  }

  /// Egyszeri takarítás: nem mentett, publikus, nem osztályhoz kötött
  /// felfedezés-cache sorok törlése (lásd "Felfedezést NE cachelje").
  /// A saját vázlatokat/draftokat nem törli.
  Future<int> pruneUncachedDiscoverBundles({String? userId}) async {
    final saves = await db.select(db.librarySaves).get();
    final savedIds = saves.map((s) => s.bundleId).toSet();
    final assigned = await db.select(db.classBundles).get();
    final assignedIds = assigned.map((s) => s.bundleId).toSet();
    final rows = await (db.select(db.bundles)
          ..where((b) => b.status.equals('public') & b.deleted.equals(false)))
        .get();
    var removed = 0;
    for (final row in rows) {
      if (savedIds.contains(row.id) || assignedIds.contains(row.id)) continue;
      // Saját sorokat nem törlünk (akkor sem, ha épp nincs mentve).
      if (userId != null &&
          (row.ownerUserId == userId || row.ownerUserId == 'local')) {
        continue;
      }
      final lessons = await (db.select(
        db.lessons,
      )..where((l) => l.bundleId.equals(row.id))).get();
      for (final lesson in lessons) {
        await deleteLesson(lesson.id);
      }
      await (db.delete(db.activities)..where((a) => a.bundleId.equals(row.id)))
          .go();
      await (db.delete(db.bundles)..where((b) => b.id.equals(row.id))).go();
      removed++;
    }
    return removed;
  }

  Future<void> updateLesson({
    required String id,
    required String title,
    required String body,
  }) async {
    await updateLessonTitle(id: id, title: title);
    final existing = await (db.select(
      db.lessonPages,
    )..where((p) => p.lessonId.equals(id))).get();
    for (final page in existing) {
      await (db.delete(
        db.lessonPages,
      )..where((p) => p.id.equals(page.id))).go();
    }
    final chunks = body
        .split(RegExp(r'\n\s*\n'))
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .toList();
    var order = 0;
    for (final chunk in chunks) {
      await db
          .into(db.lessonPages)
          .insert(
            LessonPagesCompanion.insert(
              id: _uuid.v4(),
              lessonId: id,
              sortOrder: Value(order++),
              body: chunk,
            ),
          );
    }
  }

  Future<void> updateLessonTitle({
    required String id,
    required String title,
  }) async {
    await (db.update(db.lessons)..where((l) => l.id.equals(id))).write(
      LessonsCompanion(title: Value(title.trim())),
    );
  }

  Future<String> addLessonPage({
    required String lessonId,
    required String body,
    LessonStepType type = LessonStepType.text,
    Map<String, dynamic> payload = const {},
  }) async {
    final pages = await (db.select(
      db.lessonPages,
    )..where((p) => p.lessonId.equals(lessonId))).get();
    final id = _uuid.v4();
    await db
        .into(db.lessonPages)
        .insert(
          LessonPagesCompanion.insert(
            id: id,
            lessonId: lessonId,
            sortOrder: Value(pages.length),
            body: body,
            type: Value(type.name),
            payloadJson: Value(jsonEncode(payload)),
          ),
        );
    return id;
  }

  Future<void> reorderLessonPages(String lessonId, List<String> ids) async {
    await db.transaction(() async {
      for (var i = 0; i < ids.length; i++) {
        await (db.update(db.lessonPages)
              ..where((p) => p.id.equals(ids[i]) & p.lessonId.equals(lessonId)))
            .write(LessonPagesCompanion(sortOrder: Value(i)));
      }
    });
  }

  Future<void> updateLessonPage({
    required String id,
    String? body,
    LessonStepType? type,
    Map<String, dynamic>? payload,
  }) async {
    await (db.update(db.lessonPages)..where((p) => p.id.equals(id))).write(
      LessonPagesCompanion(
        body: body == null ? const Value.absent() : Value(body),
        type: type == null ? const Value.absent() : Value(type.name),
        payloadJson: payload == null
            ? const Value.absent()
            : Value(jsonEncode(payload)),
      ),
    );
  }

  Future<void> deleteLessonPage(String id) async {
    final page = await (db.select(
      db.lessonPages,
    )..where((p) => p.id.equals(id))).getSingleOrNull();
    if (page == null) return;
    await (db.delete(db.lessonPages)..where((p) => p.id.equals(id))).go();
    final rest = await (db.select(
      db.lessonPages,
    )..where((p) => p.lessonId.equals(page.lessonId))).get();
    rest.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    for (var i = 0; i < rest.length; i++) {
      await (db.update(db.lessonPages)..where((p) => p.id.equals(rest[i].id)))
          .write(LessonPagesCompanion(sortOrder: Value(i)));
    }
  }

  Future<void> deleteLesson(String id) async {
    await (db.delete(db.lessonPages)..where((p) => p.lessonId.equals(id))).go();
    await (db.delete(
      db.lessonExercises,
    )..where((e) => e.lessonId.equals(id))).go();
    await (db.delete(
      db.lessonProgress,
    )..where((p) => p.lessonId.equals(id))).go();
    await (db.delete(db.lessons)..where((l) => l.id.equals(id))).go();
  }

  /// Teljes csomag törlése (csak vázlat állapotban hívható a UI-ról).
  /// A letöltött példányok más eszközökön megmaradnak, mert azok
  /// külön DB-sorok + librarySaves bejegyzések.
  Future<void> deleteBundle(String id) async {
    final lessons = await (db.select(
      db.lessons,
    )..where((l) => l.bundleId.equals(id))).get();
    for (final lesson in lessons) {
      await deleteLesson(lesson.id);
    }
    await (db.delete(db.activities)..where((a) => a.bundleId.equals(id))).go();
    await (db.delete(
      db.librarySaves,
    )..where((s) => s.bundleId.equals(id))).go();
    await (db.delete(
      db.classBundles,
    )..where((c) => c.bundleId.equals(id))).go();
    await (db.delete(db.bundles)..where((b) => b.id.equals(id))).go();
  }

  Future<List<LessonExerciseView>> exercisesForLesson(String lessonId) async {
    final rows = await (db.select(
      db.lessonExercises,
    )..where((e) => e.lessonId.equals(lessonId))).get();
    rows.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return [
      for (final row in rows)
        LessonExerciseView(
          id: row.id,
          lessonId: lessonId,
          type: lessonExerciseTypeFrom(row.type),
          prompt: row.prompt,
          answer: row.answer,
          payload: _jsonMap(row.payloadJson),
          sortOrder: row.sortOrder,
        ),
    ];
  }

  Future<String> addExercise({
    required String lessonId,
    required LessonExerciseType type,
    String prompt = '',
    String answer = '',
    Map<String, dynamic> payload = const {},
  }) async {
    final existing = await (db.select(
      db.lessonExercises,
    )..where((e) => e.lessonId.equals(lessonId))).get();
    final id = _uuid.v4();
    await db
        .into(db.lessonExercises)
        .insert(
          LessonExercisesCompanion.insert(
            id: id,
            lessonId: lessonId,
            type: type.name,
            prompt: prompt,
            answer: Value(answer),
            payloadJson: Value(jsonEncode(payload)),
            sortOrder: Value(existing.length),
          ),
        );
    return id;
  }

  Future<void> updateExercise({
    required String id,
    String? prompt,
    String? answer,
    Map<String, dynamic>? payload,
    LessonExerciseType? type,
  }) async {
    await (db.update(db.lessonExercises)..where((e) => e.id.equals(id))).write(
      LessonExercisesCompanion(
        prompt: prompt == null ? const Value.absent() : Value(prompt),
        answer: answer == null ? const Value.absent() : Value(answer),
        payloadJson: payload == null
            ? const Value.absent()
            : Value(jsonEncode(payload)),
        type: type == null ? const Value.absent() : Value(type.name),
      ),
    );
  }

  Future<void> reorderExercises(String lessonId, List<String> ids) async {
    await db.transaction(() async {
      for (var i = 0; i < ids.length; i++) {
        await (db.update(db.lessonExercises)
              ..where((e) => e.id.equals(ids[i]) & e.lessonId.equals(lessonId)))
            .write(LessonExercisesCompanion(sortOrder: Value(i)));
      }
    });
  }

  Future<void> deleteExercise(String id) async {
    final row = await (db.select(
      db.lessonExercises,
    )..where((e) => e.id.equals(id))).getSingleOrNull();
    if (row == null) return;
    await (db.delete(db.lessonExercises)..where((e) => e.id.equals(id))).go();
    final rest = await (db.select(
      db.lessonExercises,
    )..where((e) => e.lessonId.equals(row.lessonId))).get();
    rest.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    for (var i = 0; i < rest.length; i++) {
      await (db.update(db.lessonExercises)
            ..where((e) => e.id.equals(rest[i].id)))
          .write(LessonExercisesCompanion(sortOrder: Value(i)));
    }
  }

  Future<void> upsertRemoteBundle(
    Map<String, dynamic> raw, {
    required String userId,
    bool save = false,
  }) async {
    final id = raw['id'] as String?;
    if (id == null) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    final updatedAt = _millis(raw['updatedAt']) ?? now;
    await db
        .into(db.bundles)
        .insertOnConflictUpdate(
          BundlesCompanion.insert(
            id: id,
            kind: raw['kind'] as String? ?? 'skill',
            subject: raw['subject'] as String? ?? '',
            title: raw['title'] as String? ?? 'Csomag',
            ownerUserId: Value(raw['ownerId'] as String?),
            status: Value(raw['status'] as String? ?? 'public'),
            createdAt: _millis(raw['createdAt']) ?? updatedAt,
            updatedAt: updatedAt,
          ),
        );
    for (final lesson in raw['lessons'] as List? ?? const []) {
      if (lesson is! Map) continue;
      final lessonId = lesson['id'] as String? ?? _uuid.v4();
      await db
          .into(db.lessons)
          .insertOnConflictUpdate(
            LessonsCompanion.insert(
              id: lessonId,
              bundleId: id,
              title: lesson['title'] as String? ?? '',
              sortOrder: Value((lesson['sortOrder'] as num?)?.toInt() ?? 0),
            ),
          );
      for (final page in lesson['pages'] as List? ?? const []) {
        if (page is! Map) continue;
        await db
            .into(db.lessonPages)
            .insertOnConflictUpdate(
              LessonPagesCompanion.insert(
                id: page['id'] as String? ?? _uuid.v4(),
                lessonId: lessonId,
                sortOrder: Value((page['sortOrder'] as num?)?.toInt() ?? 0),
                body: page['body'] as String? ?? '',
                type: Value(page['type'] as String? ?? 'text'),
                payloadJson: Value(jsonEncode(page['payload'] ?? {})),
              ),
            );
      }
      for (final exercise in lesson['exercises'] as List? ?? const []) {
        if (exercise is! Map) continue;
        await db
            .into(db.lessonExercises)
            .insertOnConflictUpdate(
              LessonExercisesCompanion.insert(
                id: exercise['id'] as String? ?? _uuid.v4(),
                lessonId: lessonId,
                type: exercise['type'] as String? ?? 'flip',
                prompt: exercise['prompt'] as String? ?? '',
                answer: Value(exercise['answer'] as String? ?? ''),
                payloadJson: Value(jsonEncode(exercise['payload'] ?? {})),
                sortOrder: Value((exercise['sortOrder'] as num?)?.toInt() ?? 0),
              ),
            );
      }
    }
    for (final activity in raw['activities'] as List? ?? const []) {
      if (activity is! Map) continue;
      final activityId = activity['id'] as String? ?? _uuid.v4();
      var setId = activity['setId'] as String?;
      final remoteCards = activity['cards'] as List?;
      if (activity['type'] == 'cards' &&
          remoteCards != null &&
          remoteCards.isNotEmpty) {
        final subjectName = raw['subject'] as String? ?? '';
        final subjectId = await _subjectIdForName(subjectName);
        setId ??= await createDeck(
          subjectId: subjectId,
          name: raw['title'] as String? ?? 'Csomag',
        );
        final existingCards = await (db.select(
          db.cards,
        )..where((c) => c.deckId.equals(setId!))).get();
        if (existingCards.isEmpty) {
          for (final card in remoteCards) {
            if (card is! Map) continue;
            await upsertCard(
              deckId: setId,
              front: card['front'] as String? ?? '',
              back: card['back'] as String? ?? '',
              hint: card['hint'] as String?,
              example: card['example'] as String?,
            );
          }
        }
      }
      await db
          .into(db.activities)
          .insertOnConflictUpdate(
            ActivitiesCompanion.insert(
              id: activityId,
              bundleId: id,
              type: activity['type'] as String? ?? 'cards',
              title: activity['title'] as String? ?? '',
              setId: Value(setId),
              serverSetId: Value(activity['serverSetId'] as String?),
              sortOrder: Value((activity['sortOrder'] as num?)?.toInt() ?? 0),
            ),
          );
      final hotspots = activity['hotspots'] as List?;
      if (activity['type'] == 'map' && hotspots != null) {
        await db
            .into(db.mapItems)
            .insertOnConflictUpdate(
              MapItemsCompanion.insert(
                id: activity['mapItemId'] as String? ?? _uuid.v4(),
                activityId: activityId,
                hotspotsJson: jsonEncode(hotspots),
              ),
            );
      }
    }
    if (save || raw['saved'] == true) {
      await saveBundle(id, userId);
    }
  }

  Future<Map<String, dynamic>> bundleSnapshot(String bundleId) async {
    final bundle = await (db.select(
      db.bundles,
    )..where((b) => b.id.equals(bundleId))).getSingleOrNull();
    if (bundle == null) return {};
    final lessons = await lessonsForBundle(bundleId);
    final activities = await activitiesForBundle(bundleId);
    return {
      'id': bundle.id,
      'kind': bundle.kind,
      'subject': bundle.subject,
      'title': bundle.title,
      'ownerId': bundle.ownerUserId,
      'status': bundle.status,
      'createdAt': _iso(bundle.createdAt),
      'updatedAt': _iso(bundle.updatedAt),
      'lessons': [
        for (final lesson in lessons)
          {
            'id': lesson.id,
            'title': lesson.title,
            'sortOrder': lesson.sortOrder,
            'pages': [
              for (final page in await pagesForLesson(lesson.id))
                {
                  'id': page.id,
                  'sortOrder': page.sortOrder,
                  'body': page.body,
                  'type': page.type.name,
                  'payload': page.payload,
                },
            ],
            'exercises': [
              for (final item in await exercisesForLesson(lesson.id))
                {
                  'id': item.id,
                  'type': item.type.name,
                  'prompt': item.prompt,
                  'answer': item.answer,
                  'payload': item.payload,
                  'sortOrder': item.sortOrder,
                },
            ],
          },
      ],
      'activities': [
        for (final activity in activities)
          {
            'id': activity.id,
            'type': activity.type,
            'title': activity.title,
            'setId': activity.setId,
            'serverSetId': activity.serverSetId,
            'sortOrder': activity.sortOrder,
            if (activity.setId != null)
              'cards': [
                for (final card in await cardsForDeck(activity.setId!))
                  {
                    'front': card.front,
                    'back': card.back,
                    'hint': card.hint,
                    'example': card.example,
                  },
              ],
            if (activity.type == 'map')
              'hotspots': [
                for (final h in await hotspotsForActivity(activity.id))
                  h.toJson(),
              ],
          },
      ],
    };
  }

  Future<void> assignClassBundle(String classId, String bundleId) async {
    await db
        .into(db.classBundles)
        .insertOnConflictUpdate(
          ClassBundlesCompanion.insert(
            classId: classId,
            bundleId: bundleId,
            assignedAt: DateTime.now().millisecondsSinceEpoch,
          ),
        );
    await saveBundle(bundleId, 'local');
  }

  Future<List<BundleView>> classBundles(String classId, String userId) async {
    final rows = await (db.select(
      db.classBundles,
    )..where((c) => c.classId.equals(classId))).get();
    final views = <BundleView>[];
    for (final row in rows) {
      final view = await bundleById(row.bundleId, userId);
      if (view != null) views.add(view);
    }
    return views;
  }

  Future<int?> classBundleAssignedAt(String classId, String bundleId) async {
    final row =
        await (db.select(db.classBundles)..where(
              (c) => c.classId.equals(classId) & c.bundleId.equals(bundleId),
            ))
            .getSingleOrNull();
    return row?.assignedAt;
  }

  Future<void> unassignClassBundle(String classId, String bundleId) async {
    await (db.delete(db.classBundles)..where(
          (c) => c.classId.equals(classId) & c.bundleId.equals(bundleId),
        ))
        .go();
  }

  Map<String, dynamic> _jsonMap(String raw) {
    try {
      final value = jsonDecode(raw);
      if (value is Map) return Map<String, dynamic>.from(value);
    } catch (_) {}
    return {};
  }

  String _iso(int millis) => DateTime.fromMillisecondsSinceEpoch(
    millis,
    isUtc: true,
  ).toIso8601String();

  int? _millis(Object? value) {
    if (value is int) return value;
    if (value is String && value.isNotEmpty)
      return DateTime.tryParse(value)?.millisecondsSinceEpoch;
    return null;
  }
}
