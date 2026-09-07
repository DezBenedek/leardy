import 'dart:convert';
import 'dart:math';

import 'package:fsrs/fsrs.dart';
import 'package:leardy/domain/models.dart';

class SrsResult {
  const SrsResult({
    required this.state,
    required this.dueAt,
    required this.stability,
    required this.difficulty,
    required this.fsrsJson,
    required this.again,
  });

  final String state;
  final int dueAt;
  final double stability;
  final double difficulty;
  final String fsrsJson;
  final bool again;
}

Rating ratingFor(ReviewGrade grade) {
  return switch (grade) {
    ReviewGrade.again => Rating.again,
    ReviewGrade.hard => Rating.hard,
    ReviewGrade.good => Rating.good,
    ReviewGrade.easy => Rating.easy,
  };
}

ReviewGrade gradeFromTyped({required bool correct, required int elapsedMs}) {
  if (!correct) return ReviewGrade.again;
  if (elapsedMs < 2500) return ReviewGrade.easy;
  if (elapsedMs < 8000) return ReviewGrade.good;
  return ReviewGrade.hard;
}

ReviewGrade gradeFromChoice({required bool correct, required int elapsedMs}) {
  if (!correct) return ReviewGrade.again;
  if (elapsedMs < 4000) return ReviewGrade.easy;
  return ReviewGrade.good;
}

/// Tudásszint-kulcs a 0-4-es számlálóból a feliratokhoz.
String levelKeyFor(int level) {
  if (level <= 0) return 'zero';
  if (level == 1) return 'veryHard';
  if (level == 2) return 'hard';
  if (level == 3) return 'medium';
  return 'easy';
}

String normalizeAnswer(String value) {
  return value
      .toLowerCase()
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ')
      .replaceAll(RegExp(r'[.,!?;:]'), '');
}

int levenshtein(String a, String b) {
  if (a == b) return 0;
  if (a.isEmpty) return b.length;
  if (b.isEmpty) return a.length;
  final prev = List<int>.generate(b.length + 1, (i) => i);
  final curr = List<int>.filled(b.length + 1, 0);
  for (var i = 0; i < a.length; i++) {
    curr[0] = i + 1;
    for (var j = 0; j < b.length; j++) {
      final cost = a[i] == b[j] ? 0 : 1;
      curr[j + 1] = min(min(curr[j] + 1, prev[j + 1] + 1), prev[j] + cost);
    }
    prev.setAll(0, curr);
  }
  return prev[b.length];
}

bool fuzzyMatch(String typed, String expected) {
  final a = normalizeAnswer(typed);
  final b = normalizeAnswer(expected);
  if (a == b) return true;
  if (a.isEmpty) return false;
  final distance = levenshtein(a, b);
  final allowed = b.length <= 4 ? 1 : 2;
  return distance <= allowed;
}

SrsResult scheduleReview({
  required String? storedJson,
  required ReviewGrade grade,
  DateTime? now,
}) {
  final moment = (now ?? DateTime.now()).toUtc();
  final scheduler = Scheduler(enableFuzzing: false);
  late Card card;
  if (storedJson == null || storedJson.isEmpty || storedJson == '{}') {
    card = Card(cardId: moment.millisecondsSinceEpoch, due: moment);
  } else {
    try {
      card = Card.fromMap(_asMap(jsonDecode(storedJson)));
    } catch (_) {
      card = Card(cardId: moment.millisecondsSinceEpoch, due: moment);
    }
  }
  final reviewed = scheduler.reviewCard(card, ratingFor(grade), reviewDateTime: moment);
  final next = reviewed.card;
  return SrsResult(
    state: next.state.name,
    dueAt: next.due.millisecondsSinceEpoch,
    stability: next.stability ?? 0,
    difficulty: next.difficulty ?? 0,
    fsrsJson: jsonEncode(next.toMap()),
    again: grade == ReviewGrade.again,
  );
}

Map<String, dynamic> _asMap(Object? raw) {
  return Map<String, dynamic>.from(raw as Map);
}
