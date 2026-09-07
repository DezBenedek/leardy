import 'dart:async';

/// Debounced, per-id saves so typing in one block cannot write another.
class LessonSaveQueue {
  LessonSaveQueue({this.delay = const Duration(milliseconds: 280)});

  final Duration delay;
  final _timers = <String, Timer>{};
  final _pending = <String, Future<void> Function()>{};
  Future<void> _chain = Future<void>.value();
  var _busy = 0;
  void Function(bool busy)? onBusy;

  void schedule(String id, Future<void> Function() save) {
    _pending[id] = save;
    _timers[id]?.cancel();
    _timers[id] = Timer(delay, () {
      _timers.remove(id);
      final fn = _pending.remove(id);
      if (fn != null) _enqueue(fn);
    });
  }

  void cancel(String id) {
    _timers[id]?.cancel();
    _timers.remove(id);
    _pending.remove(id);
  }

  Future<void> flush() async {
    for (final timer in _timers.values) {
      timer.cancel();
    }
    _timers.clear();
    final jobs = List<Future<void> Function()>.from(_pending.values);
    _pending.clear();
    for (final fn in jobs) {
      _enqueue(fn);
    }
    await _chain;
  }

  void dispose() {
    for (final timer in _timers.values) {
      timer.cancel();
    }
    _timers.clear();
    final jobs = List<Future<void> Function()>.from(_pending.values);
    _pending.clear();
    for (final fn in jobs) {
      fn();
    }
  }

  void _enqueue(Future<void> Function() fn) {
    _chain = _chain
        .then((_) async {
          _setBusy(1);
          try {
            await fn();
          } finally {
            _setBusy(-1);
          }
        })
        .catchError((_) {});
  }

  void _setBusy(int delta) {
    _busy += delta;
    onBusy?.call(_busy > 0);
  }
}
