import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

/// Élő doga-meghívó: a könnyű /classes/live végpontot kérdezi le,
/// ritkán (15 mp), csak előtérben, hiba esetén lassítva.
/// Korábban a teljes osztálylistát kérte le 4 mp-enként — ez spammelte az API-t.
class QuizInviteHost extends ConsumerStatefulWidget {
  const QuizInviteHost({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<QuizInviteHost> createState() => _QuizInviteHostState();
}

class _QuizInviteHostState extends ConsumerState<QuizInviteHost>
    with WidgetsBindingObserver {
  static const _interval = Duration(seconds: 15);
  static const _maxBackoff = Duration(minutes: 2);

  Timer? _timer;
  final _seen = <String>{};
  bool _dialogOpen = false;
  bool _alive = true;
  bool _foreground = true;
  bool _busy = false;
  var _failures = 0;
  DateTime? _nextPollAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(_interval, (_) {
      if (!_alive) return;
      unawaited(_poll());
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_alive) unawaited(_poll());
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = state == AppLifecycleState.resumed;
    if (foreground && !_foreground && _alive && mounted) {
      // Visszatéréskor egyből nézünk, ne kelljen várni a ciklusra.
      unawaited(_poll());
    }
    _foreground = foreground;
  }

  @override
  void deactivate() {
    _alive = false;
    super.deactivate();
  }

  @override
  void activate() {
    super.activate();
    _alive = true;
  }

  @override
  void dispose() {
    _alive = false;
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _timer = null;
    super.dispose();
  }

  Future<void> _poll() async {
    if (!_alive || !mounted || _dialogOpen || _busy || !_foreground) return;
    final next = _nextPollAt;
    if (next != null && DateTime.now().isBefore(next)) return;
    if (!ref.read(authProvider).isAuthenticated) return;
    _busy = true;
    try {
      final live = await ref.read(authProvider.notifier).client.liveQuizzes();
      _failures = 0;
      _nextPollAt = null;
      if (!_alive || !mounted) return;
      QuizInvite? invite;
      for (final item in live) {
        if (item.sessionId.isNotEmpty && !_seen.contains(item.sessionId)) {
          invite = item;
          break;
        }
      }
      final found = invite;
      if (found == null || !_alive || !mounted) return;
      final route = GoRouterState.of(context).uri.path;
      _seen.add(found.sessionId);
      if (route.contains('/doga/${found.sessionId}')) return;
      _dialogOpen = true;
      final l10n = L10n.of(context);
      final join = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(l10n.quizInvite),
          content: Text('${found.className}\n${l10n.quizLive}'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.closeQuestion)),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.quizJoin)),
          ],
        ),
      );
      _dialogOpen = false;
      if (join == true && _alive && mounted) {
        context.push('/tanterem/${found.classId}/doga/${found.sessionId}');
      }
    } catch (_) {
      // Hiba esetén exponenciális lassítás, max 2 percig.
      _failures += 1;
      final backoff = Duration(seconds: 15 * (1 << (_failures - 1).clamp(0, 3)));
      _nextPollAt = DateTime.now().add(
        backoff > _maxBackoff ? _maxBackoff : backoff,
      );
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
