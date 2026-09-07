import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'database.g.dart';

class Subjects extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get description => text().withDefault(const Constant(''))();
  TextColumn get colorKey => text()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();
  TextColumn get syncStatus => text().withDefault(const Constant('pending'))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class Decks extends Table {
  TextColumn get id => text()();
  TextColumn get subjectId => text().references(Subjects, #id)();
  TextColumn get name => text()();
  TextColumn get description => text().withDefault(const Constant(''))();
  TextColumn get ownerUserId => text().nullable()();
  TextColumn get sourceClassId => text().nullable()();
  TextColumn get sourceSetId => text().nullable()();
  TextColumn get access => text().withDefault(const Constant('owner'))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();
  TextColumn get syncStatus => text().withDefault(const Constant('pending'))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class DeckEditors extends Table {
  TextColumn get deckId => text().references(Decks, #id)();
  TextColumn get userId => text()();
  TextColumn get username => text().withDefault(const Constant(''))();
  IntColumn get createdAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {deckId, userId};
}

class Cards extends Table {
  TextColumn get id => text()();
  TextColumn get deckId => text().references(Decks, #id)();
  TextColumn get front => text()();
  TextColumn get back => text()();
  TextColumn get hint => text().nullable()();
  TextColumn get example => text().nullable()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();
  TextColumn get syncStatus => text().withDefault(const Constant('pending'))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class CardSchedules extends Table {
  TextColumn get cardId => text().references(Cards, #id)();
  TextColumn get state => text().withDefault(const Constant('new'))();
  IntColumn get dueAt => integer()();
  RealColumn get stability => real().withDefault(const Constant(0))();
  RealColumn get difficulty => real().withDefault(const Constant(0))();
  IntColumn get reps => integer().withDefault(const Constant(0))();
  IntColumn get lapses => integer().withDefault(const Constant(0))();
  IntColumn get lastReviewedAt => integer().nullable()();
  TextColumn get fsrsJson => text().withDefault(const Constant('{}'))();
  IntColumn get updatedAt => integer()();
  // Egyszerű tudásszint-számláló: 0-ról indul, helyes +1, rontott -1 (0-4).
  IntColumn get level => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {cardId};
}

class ReviewLogs extends Table {
  TextColumn get id => text()();
  TextColumn get cardId => text().references(Cards, #id)();
  IntColumn get reviewedAt => integer()();
  TextColumn get rating => text()();
  TextColumn get mode => text()();
  BoolColumn get wasCorrect => boolean()();
  IntColumn get elapsedMs => integer().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class DailyActivities extends Table {
  TextColumn get date => text()();
  IntColumn get cardsReviewed => integer().withDefault(const Constant(0))();
  IntColumn get studyTimeSeconds => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {date};
}

class AppSettings extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

class OutboxItems extends Table {
  TextColumn get id => text()();
  IntColumn get seq => integer().autoIncrement()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  TextColumn get operation => text()();
  TextColumn get payloadJson => text()();
  TextColumn get status => text().withDefault(const Constant('pending'))();
  IntColumn get createdAt => integer()();
}

class Bundles extends Table {
  TextColumn get id => text()();
  TextColumn get kind => text()();
  TextColumn get subject => text()();
  TextColumn get title => text()();
  TextColumn get ownerUserId => text().nullable()();
  TextColumn get status => text().withDefault(const Constant('public'))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class Lessons extends Table {
  TextColumn get id => text()();
  TextColumn get bundleId => text().references(Bundles, #id)();
  TextColumn get title => text()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LessonPages extends Table {
  TextColumn get id => text()();
  TextColumn get lessonId => text().references(Lessons, #id)();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  TextColumn get body => text()();
  TextColumn get type => text().withDefault(const Constant('text'))();
  TextColumn get payloadJson => text().withDefault(const Constant('{}'))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LessonExercises extends Table {
  TextColumn get id => text()();
  TextColumn get lessonId => text().references(Lessons, #id)();
  TextColumn get type => text()();
  TextColumn get prompt => text()();
  TextColumn get answer => text().withDefault(const Constant(''))();
  TextColumn get payloadJson => text().withDefault(const Constant('{}'))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class Activities extends Table {
  TextColumn get id => text()();
  TextColumn get bundleId => text().references(Bundles, #id)();
  TextColumn get type => text()();
  TextColumn get title => text()();
  TextColumn get setId => text().nullable()();
  TextColumn get serverSetId => text().nullable()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class MapItems extends Table {
  TextColumn get id => text()();
  TextColumn get activityId => text().references(Activities, #id)();
  TextColumn get hotspotsJson => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LibrarySaves extends Table {
  TextColumn get bundleId => text().references(Bundles, #id)();
  TextColumn get userId => text().withDefault(const Constant('local'))();
  IntColumn get createdAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {bundleId, userId};
}

class ClassBundles extends Table {
  TextColumn get classId => text()();
  TextColumn get bundleId => text().references(Bundles, #id)();
  IntColumn get assignedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {classId, bundleId};
}

class LessonProgress extends Table {
  TextColumn get lessonId => text().references(Lessons, #id)();
  IntColumn get completedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {lessonId};
}

@DriftDatabase(
  tables: [
    Subjects,
    Decks,
    DeckEditors,
    Cards,
    CardSchedules,
    ReviewLogs,
    DailyActivities,
    AppSettings,
    OutboxItems,
    Bundles,
    Lessons,
    LessonPages,
    LessonExercises,
    Activities,
    MapItems,
    LibrarySaves,
    ClassBundles,
    LessonProgress,
  ],
)
class LeardyDatabase extends _$LeardyDatabase {
  LeardyDatabase([QueryExecutor? executor]) : super(executor ?? _open());

  @override
  int get schemaVersion => 5;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
        },
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.addColumn(decks, decks.ownerUserId);
            await m.addColumn(decks, decks.sourceClassId);
            await m.addColumn(decks, decks.sourceSetId);
            await m.addColumn(decks, decks.access);
            await m.createTable(deckEditors);
          }
          if (from < 3) {
            await m.createTable(bundles);
            await m.createTable(lessons);
            await m.createTable(lessonPages);
            await m.createTable(activities);
            await m.createTable(mapItems);
            await m.createTable(librarySaves);
            await m.createTable(classBundles);
            await m.createTable(lessonProgress);
          }
          if (from < 4) {
            await m.addColumn(lessonPages, lessonPages.type);
            await m.addColumn(lessonPages, lessonPages.payloadJson);
            await m.createTable(lessonExercises);
          }
          if (from < 5) {
            await m.addColumn(cardSchedules, cardSchedules.level);
          }
        },
      );

  static QueryExecutor _open() {
    return driftDatabase(name: 'leardy');
  }
}
