int streakFromDates(Iterable<String> ymdDates, {DateTime? today}) {
  final day = today ?? DateTime.now();
  final local = DateTime(day.year, day.month, day.day);
  final set = ymdDates.toSet();
  var cursor = local;
  if (!set.contains(_fmt(cursor))) {
    cursor = cursor.subtract(const Duration(days: 1));
    if (!set.contains(_fmt(cursor))) return 0;
  }
  var streak = 0;
  while (set.contains(_fmt(cursor))) {
    streak += 1;
    cursor = cursor.subtract(const Duration(days: 1));
  }
  return streak;
}

String formatDay(DateTime date) {
  final local = DateTime(date.year, date.month, date.day);
  return _fmt(local);
}

String _fmt(DateTime d) {
  final m = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '${d.year}-$m-$day';
}

List<int> last28Counts(Map<String, int> byDate, {DateTime? today}) {
  final day = today ?? DateTime.now();
  final local = DateTime(day.year, day.month, day.day);
  return List.generate(28, (i) {
    final d = local.subtract(Duration(days: 27 - i));
    return byDate[_fmt(d)] ?? 0;
  });
}
