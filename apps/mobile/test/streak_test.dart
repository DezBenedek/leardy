import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/domain/srs.dart';
import 'package:leardy/domain/streak.dart';

void main() {
  test('streak counts consecutive local days including today', () {
    final today = DateTime(2026, 9, 2);
    expect(
      streakFromDates(['2026-09-02', '2026-09-01', '2026-08-31'], today: today),
      3,
    );
  });

  test('streak uses yesterday if today is empty', () {
    final today = DateTime(2026, 9, 2);
    expect(streakFromDates(['2026-09-01', '2026-08-31'], today: today), 2);
  });

  test('streak breaks on a gap', () {
    final today = DateTime(2026, 9, 2);
    expect(streakFromDates(['2026-09-02', '2026-08-30'], today: today), 1);
  });

  test('fuzzy match allows a small typo', () {
    expect(fuzzyMatch('notebook', 'notebook'), isTrue);
    expect(fuzzyMatch('noteebook', 'notebook'), isTrue);
    expect(fuzzyMatch('asztal', 'notebook'), isFalse);
  });

  test('typed grades map time to FSRS ratings', () {
    expect(gradeFromTyped(correct: false, elapsedMs: 400), ReviewGrade.again);
    expect(gradeFromTyped(correct: true, elapsedMs: 1200), ReviewGrade.easy);
    expect(gradeFromTyped(correct: true, elapsedMs: 4000), ReviewGrade.good);
    expect(gradeFromTyped(correct: true, elapsedMs: 12000), ReviewGrade.hard);
  });

  test('formatDay uses the local calendar date', () {
    expect(formatDay(DateTime(2026, 9, 2, 23, 15)), '2026-09-02');
    expect(formatDay(DateTime(2026, 1, 5)), '2026-01-05');
  });

  test('last28Counts fills missing days with zero', () {
    final today = DateTime(2026, 9, 2);
    final counts = last28Counts({'2026-09-02': 4, '2026-08-07': 2}, today: today);
    expect(counts.length, 28);
    expect(counts.first, 0);
    expect(counts.last, 4);
    expect(counts[1], 2);
  });

  test('FSRS schedules a later due date after a good review', () {
    final now = DateTime.utc(2026, 9, 2, 10);
    final first = scheduleReview(storedJson: null, grade: ReviewGrade.good, now: now);
    expect(first.dueAt, greaterThan(now.millisecondsSinceEpoch));
    final second = scheduleReview(storedJson: first.fsrsJson, grade: ReviewGrade.easy, now: now.add(const Duration(days: 2)));
    expect(second.dueAt, greaterThan(first.dueAt));
  });
}
