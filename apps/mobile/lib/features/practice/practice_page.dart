import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/design_system/components/feedback_pill.dart';
import 'package:leardy/design_system/components/knowledge_signal.dart';
import 'package:leardy/design_system/components/session_scaffold.dart';
import 'package:leardy/design_system/components/zso_kartya.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/domain/srs.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class PracticePage extends ConsumerStatefulWidget {
  const PracticePage({super.key, required this.deckId, required this.mode});

  final String deckId;
  final PracticeMode mode;

  @override
  ConsumerState<PracticePage> createState() => _PracticePageState();
}

class _PracticePageState extends ConsumerState<PracticePage> {
  List<CardView> _queue = [];
  int _index = 0;
  bool _revealed = false;
  bool _typedCorrect = false;
  bool _loading = true;
  final _typed = TextEditingController();
  late DateTime _started;
  late DateTime _sessionStarted;
  List<String> _choices = [];
  String? _picked;
  int _correct = 0;
  int _wrong = 0;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  /// Teszt módban kártyánként kisorsolt feladattípus.
  List<PracticeMode> _mixedModes = [];
  final _wrongCards = <CardView>[];

  Future<void> _boot() async {
    final due = await ref.read(libraryProvider).dueQueue(deckId: widget.deckId);
    final all = due.isEmpty
        ? await ref.read(libraryProvider).cardsForDeck(widget.deckId)
        : due;
    if (!mounted) return;
    setState(() {
      _queue = all;
      _mixedModes = _buildMixedModes(all.length);
      _loading = false;
      _started = DateTime.now();
      _sessionStarted = DateTime.now();
    });
    _prepareChoices();
  }

  /// Egyenletes keverés: flip / type / choice körforgásban, megkeverve.
  List<PracticeMode> _buildMixedModes(int length) {
    if (widget.mode != PracticeMode.quiz || length == 0) return const [];
    const options = [PracticeMode.flip, PracticeMode.type, PracticeMode.choice];
    final modes = List<PracticeMode>.generate(
      length,
      (i) => options[i % options.length],
    )..shuffle();
    return modes;
  }

  PracticeMode get _effectiveMode {
    if (widget.mode != PracticeMode.quiz) return widget.mode;
    if (_mixedModes.isEmpty) return PracticeMode.flip;
    return _mixedModes[_index.clamp(0, _mixedModes.length - 1)];
  }

  CardView? get _current => _index < _queue.length ? _queue[_index] : null;

  void _prepareChoices() {
    final card = _current;
    if (card == null || _effectiveMode != PracticeMode.choice) return;
    final others =
        _queue.where((c) => c.id != card.id).map((c) => c.back).toSet().toList()
          ..shuffle();
    final options = [card.back, ...others.take(3)]..shuffle();
    _choices = options;
    _picked = null;
  }

  void _resetSession(List<CardView> queue) {
    setState(() {
      _queue = queue;
      _mixedModes = _buildMixedModes(queue.length);
      _index = 0;
      _correct = 0;
      _wrong = 0;
      _wrongCards.clear();
      _revealed = false;
      _typedCorrect = false;
      _typed.clear();
      _started = DateTime.now();
      _sessionStarted = DateTime.now();
    });
    _prepareChoices();
  }

  Future<void> _grade(ReviewGrade grade, {required bool correct}) async {
    final card = _current;
    if (card == null) return;
    final mode = _effectiveMode;
    if (correct) {
      _correct += 1;
    } else {
      _wrong += 1;
      _wrongCards.add(card);
    }
    final elapsed = DateTime.now().difference(_started).inMilliseconds;
    setState(() {
      _index += 1;
      _revealed = false;
      _typedCorrect = false;
      _typed.clear();
      _started = DateTime.now();
    });
    _prepareChoices();
    await ref
        .read(libraryProvider)
        .recordReview(
          card: card,
          grade: grade,
          mode: mode,
          wasCorrect: correct,
          elapsedMs: elapsed,
        );
    if (!mounted) return;
    ref.invalidate(homeProvider);
  }

  String _levelKey(CardView card) => levelKeyFor(card.level);

  /// Következő esedékes csomag (a mostanin kívül) — egygombos továbbhaladás.
  String? get _nextDeckId {
    final home = ref.watch(homeProvider).value;
    if (home == null) return null;
    final rest = home.dueDecks.where((d) => d.id != widget.deckId).toList();
    return rest.isEmpty ? null : rest.first.id;
  }

  int? get _nextDeckDue {
    final home = ref.watch(homeProvider).value;
    if (home == null) return null;
    final rest = home.dueDecks.where((d) => d.id != widget.deckId).toList();
    return rest.isEmpty ? null : rest.first.dueCount;
  }

  String? get _nextDeckName {
    final home = ref.watch(homeProvider).value;
    if (home == null) return null;
    final rest = home.dueDecks.where((d) => d.id != widget.deckId).toList();
    return rest.isEmpty ? null : rest.first.name;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    if (_loading) {
      return const SessionScaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final card = _current;
    if (card == null) {
      return _resultScreen(l10n);
    }

    final flipMode = _effectiveMode == PracticeMode.flip;
    final progress = (_index + 1) / _queue.length;

    return SessionScaffold(
      progress: progress,
      body: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: 520,
                    maxHeight: 380,
                  ),
                  child: ZsoKartya(
                    key: ValueKey('${card.id}-${_effectiveMode.name}'),
                    front: card.front,
                    back: card.back,
                    stamp: '${_index + 1} / ${_queue.length}',
                    canFlip: flipMode,
                    frontHint: flipMode ? l10n.tapToFlip : null,
                    backHint: flipMode ? l10n.cardAnswer : null,
                    onFlipped: (back) => setState(() => _revealed = back),
                    onKnow: flipMode
                        ? () => _grade(ReviewGrade.good, correct: true)
                        : null,
                    onDontKnow: flipMode
                        ? () => _grade(ReviewGrade.again, correct: false)
                        : null,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            // Tudásszint jelzés — 0-ról indul, helyes +1, rontott -1.
            SizedBox(
              height: 20,
              child: Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    KnowledgeSignal(level: card.level, height: 12),
                    const SizedBox(width: 6),
                    Text(
                      l10n.knowledgeLevelLabel(_levelKey(card)),
                      style: Theme.of(context).textTheme.labelSmall
                          ?.copyWith(color: context.ink.inkMuted),
                    ),
                  ],
                ),
              ),
            ),
            if (flipMode) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    l10n.swipeDont,
                    style: Theme.of(
                      context,
                    ).textTheme.labelLarge?.copyWith(color: context.ink.wine),
                  ),
                  const Spacer(),
                  Text(
                    l10n.swipeKnow,
                    style: Theme.of(
                      context,
                    ).textTheme.labelLarge?.copyWith(color: context.ink.forest),
                  ),
                ],
              ),
            ],
            // Fix magasságú tipp-sáv, hogy ne ugráljon a layout.
            const SizedBox(height: 10),
            SizedBox(
              height: 24,
              child: Center(
                child: card.hint != null && card.hint!.trim().isNotEmpty
                    ? Text(
                        '${l10n.tip}: ${card.hint}',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      )
                    : Text(
                        l10n.noTip,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: context.ink.inkMuted.withValues(alpha: 0.5),
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 12),
            ..._modeBody(card, l10n),
          ],
        ),
      ),
    );
  }

  Widget _resultScreen(L10n l10n) {
    final total = _correct + _wrong;
    final percent = total == 0 ? 0 : ((_correct / total) * 100).round();
    final elapsed = DateTime.now().difference(_sessionStarted);
    final minutes = elapsed.inMinutes;
    final seconds = elapsed.inSeconds % 60;
    final timeLabel = minutes > 0 ? '${minutes}p ${seconds}mp' : '${seconds}mp';
    return SessionScaffold(
      onBack: () => context.pop(),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.practiceScore,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              Text(
                l10n.practiceResult(_correct, total),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displaySmall,
              ),
              const SizedBox(height: 8),
              Text(
                '$percent% · $timeLabel',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: context.ink.inkMuted,
                ),
              ),
              const SizedBox(height: 24),
              if (_nextDeckId != null) ...[
                FilledButton.icon(
                  onPressed: () => context.pushReplacement(
                    '/gyakorlas/$_nextDeckId?mod=${widget.mode.name}',
                  ),
                  icon: const Icon(Icons.skip_next_rounded),
                  label: Text(
                    _nextDeckName == null
                        ? l10n.nextPack
                        : _nextDeckDue != null && _nextDeckDue! > 0
                        ? '${l10n.nextPack}: $_nextDeckName ($_nextDeckDue)'
                        : '${l10n.nextPack}: $_nextDeckName',
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 8),
              ],
              FilledButton.tonal(
                onPressed: () => _resetSession(_queue),
                child: Text(l10n.retryPractice),
              ),
              if (_wrongCards.isNotEmpty) ...[
                const SizedBox(height: 8),
                FilledButton.tonalIcon(
                  onPressed: () => _resetSession([..._wrongCards]),
                  icon: const Icon(Icons.refresh_rounded),
                  label: Text('${l10n.retryWrong} (${_wrongCards.length})'),
                ),
              ],
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () => context.pop(),
                child: Text(l10n.backToCards),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _modeBody(CardView card, L10n l10n) {
    switch (_effectiveMode) {
      case PracticeMode.flip:
      case PracticeMode.quiz:
        return const [];
      case PracticeMode.type:
        final answered = _revealed;
        return [
          TextField(
            controller: _typed,
            enabled: !answered,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(labelText: l10n.otherSide),
            onSubmitted: (_) => _submitTyped(card),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: answered ? null : () => _submitTyped(card),
            child: Text(l10n.check),
          ),
          SizedBox(
            height: 60,
            child: Center(
              child: answered
                  ? FeedbackPill(
                      correct: _typedCorrect,
                      text: _typedCorrect
                          ? l10n.practiceCorrect
                          : l10n.correctIs(card.back),
                    )
                  : const SizedBox.shrink(),
            ),
          ),
        ];
      case PracticeMode.choice:
        final answered = _picked != null;
        final correct = _picked == card.back;
        return [
          for (final choice in _choices)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  alignment: Alignment.center,
                  foregroundColor: !answered
                      ? null
                      : choice == card.back
                      ? context.ink.forest
                      : choice == _picked
                      ? context.ink.wine
                      : null,
                  side: !answered
                      ? null
                      : choice == card.back
                      ? BorderSide(color: context.ink.forest, width: 2)
                      : choice == _picked
                      ? BorderSide(color: context.ink.wine, width: 2)
                      : null,
                ),
                onPressed: answered
                    ? null
                    : () => _submitChoice(card, choice),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (answered && choice == card.back)
                      Icon(
                        Icons.check_circle_rounded,
                        color: context.ink.forest,
                        size: 20,
                      ),
                    if (answered && choice == _picked && choice != card.back)
                      Icon(
                        Icons.cancel_rounded,
                        color: context.ink.wine,
                        size: 20,
                      ),
                    if (answered &&
                        (choice == card.back || choice == _picked))
                      const SizedBox(width: 8),
                    Flexible(
                      child: Text(choice, textAlign: TextAlign.center),
                    ),
                  ],
                ),
              ),
            ),
          SizedBox(
            height: 60,
            child: Center(
              child: answered
                  ? FeedbackPill(
                      correct: correct,
                      text: correct
                          ? l10n.practiceCorrect
                          : l10n.correctIs(card.back),
                    )
                  : const SizedBox.shrink(),
            ),
          ),
        ];
    }
  }

  Future<void> _submitTyped(CardView card) async {
    if (_revealed) return;
    final elapsed = DateTime.now().difference(_started).inMilliseconds;
    final correct = fuzzyMatch(_typed.text, card.back);
    setState(() {
      _revealed = true;
      _typedCorrect = correct;
    });
    await Future<void>.delayed(const Duration(milliseconds: 1200));
    if (!mounted) return;
    await _grade(
      gradeFromTyped(correct: correct, elapsedMs: elapsed),
      correct: correct,
    );
  }

  Future<void> _submitChoice(CardView card, String choice) async {
    if (_picked != null) return;
    final elapsed = DateTime.now().difference(_started).inMilliseconds;
    setState(() => _picked = choice);
    await Future<void>.delayed(const Duration(milliseconds: 1000));
    if (!mounted) return;
    final correct = choice == card.back;
    await _grade(
      gradeFromChoice(correct: correct, elapsedMs: elapsed),
      correct: correct,
    );
  }
}
