enum PracticeMode { flip, type, choice, quiz }

enum LessonStepType { text, fact, prompt, source }

enum LessonExerciseType { flip, choice, type, match, order }

LessonStepType lessonStepTypeFrom(String raw) {
  return LessonStepType.values.firstWhere(
    (item) => item.name == raw,
    orElse: () => LessonStepType.text,
  );
}

LessonExerciseType lessonExerciseTypeFrom(String raw) {
  return LessonExerciseType.values.firstWhere(
    (item) => item.name == raw,
    orElse: () => LessonExerciseType.flip,
  );
}

enum ReviewGrade { again, hard, good, easy }

class SubjectView {
  const SubjectView({
    required this.id,
    required this.name,
    required this.colorKey,
    required this.deckCount,
    this.category = 'other',
  });

  final String id;
  final String name;
  final String colorKey;
  final int deckCount;
  final String category;
}

class DeckView {
  const DeckView({
    required this.id,
    required this.subjectId,
    required this.name,
    required this.description,
    required this.cardCount,
    required this.dueCount,
    required this.newCount,
    required this.masteredCount,
    this.subjectName = '',
    this.ownerUserId,
    this.sourceClassId,
    this.sourceSetId,
    this.access = 'owner',
  });

  final String id;
  final String subjectId;
  final String name;
  final String description;
  final int cardCount;
  final int dueCount;
  final int newCount;
  final int masteredCount;
  final String subjectName;
  final String? ownerUserId;
  final String? sourceClassId;
  final String? sourceSetId;
  final String access;

  bool get canEdit => access == 'owner' || access == 'editor';
  bool get isOwner => access == 'owner';
  bool get isClassSet => sourceClassId != null;
}

class CardView {
  const CardView({
    required this.id,
    required this.deckId,
    required this.front,
    required this.back,
    this.hint,
    this.example,
    required this.dueAt,
    required this.state,
    this.difficulty = 0,
    this.reps = 0,
    this.level = 0,
  });

  final String id;
  final String deckId;
  final String front;
  final String back;
  final String? hint;
  final String? example;
  final int dueAt;
  final String state;
  final double difficulty;
  final int reps;
  // Tudásszint-számláló: 0-ról indul, helyes +1, rontott -1 (0-4).
  final int level;
}

class HomeSnapshot {
  const HomeSnapshot({
    required this.dueToday,
    required this.streak,
    required this.reviewedToday,
    required this.last28,
    this.dueDecks = const [],
    this.continueBundle,
    this.continueLessonId,
  });

  final int dueToday;
  final int streak;
  final int reviewedToday;
  final List<int> last28;
  final List<DeckView> dueDecks;
  final BundleView? continueBundle;
  final String? continueLessonId;
}

class BundleView {
  const BundleView({
    required this.id,
    required this.kind,
    required this.subject,
    required this.title,
    required this.status,
    this.ownerUserId,
    this.saved = false,
    this.lessonCount = 0,
    this.activityCount = 0,
    this.cardsSetId,
    this.mapActivityId,
    this.dueCount = 0,
    this.cardCount = 0,
    this.firstLessonId,
    this.incompleteLessonId,
  });

  final String id;
  final String kind;
  final String subject;
  final String title;
  final String status;
  final String? ownerUserId;
  final bool saved;
  final int lessonCount;
  final int activityCount;
  final String? cardsSetId;
  final String? mapActivityId;
  final int dueCount;
  final int cardCount;
  final String? firstLessonId;
  final String? incompleteLessonId;

  bool get isTopic => kind == 'topic';
  bool get isSkill => kind == 'skill';
  bool get isPublic => status == 'public';
  bool get isDraft => status == 'draft';
  bool get canLearn => isTopic && lessonCount > 0;
  bool get canPractice => isTopic
      ? mapActivityId != null
      : (cardsSetId != null || mapActivityId != null);

  String get openRoute {
    if (isSkill && cardsSetId != null) return '/kartyak/$cardsSetId';
    return '/tanulas/$id';
  }

  bool ownedBy(String userId) {
    if (ownerUserId == null) return false;
    return ownerUserId == userId;
  }
}

class LessonView {
  const LessonView({
    required this.id,
    required this.bundleId,
    required this.title,
    required this.sortOrder,
    required this.pageCount,
    this.completed = false,
  });

  final String id;
  final String bundleId;
  final String title;
  final int sortOrder;
  final int pageCount;
  final bool completed;

  LessonView copyWith({String? title, int? pageCount}) {
    return LessonView(
      id: id,
      bundleId: bundleId,
      title: title ?? this.title,
      sortOrder: sortOrder,
      pageCount: pageCount ?? this.pageCount,
      completed: completed,
    );
  }
}

class LessonPageView {
  const LessonPageView({
    required this.id,
    required this.lessonId,
    required this.sortOrder,
    required this.body,
    this.type = LessonStepType.text,
    this.payload = const {},
  });

  final String id;
  final String lessonId;
  final int sortOrder;
  final String body;
  final LessonStepType type;
  final Map<String, dynamic> payload;

  LessonPageView copyWith({
    String? body,
    LessonStepType? type,
    Map<String, dynamic>? payload,
    int? sortOrder,
  }) {
    return LessonPageView(
      id: id,
      lessonId: lessonId,
      sortOrder: sortOrder ?? this.sortOrder,
      body: body ?? this.body,
      type: type ?? this.type,
      payload: payload ?? this.payload,
    );
  }
}

class LessonExerciseView {
  const LessonExerciseView({
    required this.id,
    required this.lessonId,
    required this.type,
    required this.prompt,
    required this.answer,
    this.payload = const {},
    this.sortOrder = 0,
  });

  final String id;
  final String lessonId;
  final LessonExerciseType type;
  final String prompt;
  final String answer;
  final Map<String, dynamic> payload;
  final int sortOrder;

  LessonExerciseView copyWith({
    LessonExerciseType? type,
    String? prompt,
    String? answer,
    Map<String, dynamic>? payload,
    int? sortOrder,
  }) {
    return LessonExerciseView(
      id: id,
      lessonId: lessonId,
      type: type ?? this.type,
      prompt: prompt ?? this.prompt,
      answer: answer ?? this.answer,
      payload: payload ?? this.payload,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }
}

class ActivityView {
  const ActivityView({
    required this.id,
    required this.bundleId,
    required this.type,
    required this.title,
    this.setId,
    this.serverSetId,
    this.sortOrder = 0,
  });

  final String id;
  final String bundleId;
  final String type;
  final String title;
  final String? setId;
  final String? serverSetId;
  final int sortOrder;
}

class MapHotspot {
  const MapHotspot({
    required this.x,
    required this.y,
    required this.r,
    required this.name,
  });

  final double x;
  final double y;
  final double r;
  final String name;

  Map<String, dynamic> toJson() => {'x': x, 'y': y, 'r': r, 'name': name};

  factory MapHotspot.fromJson(Map<String, dynamic> json) {
    return MapHotspot(
      x: (json['x'] as num).toDouble(),
      y: (json['y'] as num).toDouble(),
      r: (json['r'] as num).toDouble(),
      name: json['name'] as String? ?? '',
    );
  }
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.username,
    this.email,
    this.isTeacher = false,
  });

  final String id;
  final String username;
  final String? email;
  final bool isTeacher;
}

class Classroom {
  const Classroom({
    required this.id,
    required this.name,
    required this.role,
    required this.allowStudentSets,
    required this.memberCount,
    this.ownerId,
    this.joinCode,
    this.activeQuizId,
    this.activeQuizStatus,
    this.members = const [],
    this.banned = const [],
  });

  final String id;
  final String name;
  final String role;
  final bool allowStudentSets;
  final int memberCount;
  final String? ownerId;
  final String? joinCode;
  final String? activeQuizId;
  final String? activeQuizStatus;
  final List<ClassMember> members;
  final List<ClassMember> banned;

  bool get isTeacher => role == 'teacher';
  bool get hasLiveQuiz =>
      activeQuizId != null && activeQuizStatus != 'FINISHED';

  List<ClassMember> get students => [
    for (final member in members)
      if (!member.isTeacher && member.userId != ownerId) member,
  ];
}

class ClassMember {
  const ClassMember({
    required this.userId,
    required this.username,
    required this.role,
    this.joinedAt,
  });

  final String userId;
  final String username;
  final String role;
  final String? joinedAt;

  bool get isTeacher => role == 'teacher';
}

class ClassMaterial {
  const ClassMaterial({
    required this.id,
    required this.title,
    this.url,
    this.note,
    this.createdBy,
    this.createdAt,
  });

  final String id;
  final String title;
  final String? url;
  final String? note;
  final String? createdBy;
  final String? createdAt;
}

class QuizInvite {
  const QuizInvite({
    required this.classId,
    required this.className,
    required this.sessionId,
    required this.status,
  });

  final String classId;
  final String className;
  final String sessionId;
  final String status;
}

class ClassSet {
  const ClassSet({
    required this.id,
    required this.name,
    required this.subject,
    this.ownerId,
    this.myRole = 'reader',
    this.createdAt,
  });

  final String id;
  final String name;
  final String subject;
  final String? ownerId;
  final String myRole;
  final String? createdAt;

  bool get canEdit => myRole == 'owner' || myRole == 'editor';
  bool get isOwner => myRole == 'owner';
}

class SetEditor {
  const SetEditor({required this.userId, required this.username, this.email});

  final String userId;
  final String username;
  final String? email;
}

class ClassCard {
  const ClassCard({
    required this.front,
    required this.back,
    this.hint,
    this.example,
  });

  final String front;
  final String back;
  final String? hint;
  final String? example;
}
