import 'package:flutter/material.dart';
import 'package:leardy/design_system/components/feedback_pill.dart';
import 'package:leardy/design_system/components/zso_kartya.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/domain/srs.dart';
import 'package:leardy/l10n/l10n.dart';

class LessonPracticePanel extends StatefulWidget {
  const LessonPracticePanel({
    super.key,
    required this.exercises,
    required this.onFinished,
    this.onSrsReview,
  });

  final List<LessonExerciseView> exercises;
  final VoidCallback onFinished;

  /// Kártya-típusú feladatok (flip/választós/beírós) SRS-mentése.
  /// A panel maga nem tud kártyákról — a hívó párosít és ment.
  final Future<void> Function({
    required LessonExerciseType type,
    required String prompt,
    required String answer,
    required bool correct,
    required int elapsedMs,
  })? onSrsReview;

  @override
  State<LessonPracticePanel> createState() => _LessonPracticePanelState();
}

class _LessonPracticePanelState extends State<LessonPracticePanel> {
  var _index = 0;
  var _correct = 0;
  var _done = false;
  String? _feedback;
  final _typed = TextEditingController();
  String? _picked;
  int? _leftPick;
  final _matched = <int>{};
  List<({int id, String text})> _orderItems = [];
  List<String> _rights = [];
  late DateTime _exerciseStarted;

  LessonExerciseView? get _current =>
      _index < widget.exercises.length ? widget.exercises[_index] : null;

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  void _prepare() {
    final item = _current;
    _feedback = null;
    _typed.clear();
    _picked = null;
    _leftPick = null;
    _matched.clear();
    _exerciseStarted = DateTime.now();
    if (item == null) return;
    if (item.type == LessonExerciseType.order) {
      _orderItems = [
        for (final (index, text) in (item.payload['items'] as List? ?? [])
            .whereType<String>()
            .indexed)
          (id: index, text: text),
      ]..shuffle();
    }
    if (item.type == LessonExerciseType.match) {
      _rights = [
        for (final pair in item.payload['pairs'] as List? ?? [])
          if (pair is Map) pair['right'] as String? ?? '',
      ]..shuffle();
    }
  }

  void _advance({required bool correct, String? expected}) {
    if (correct) _correct += 1;
    final item = _current;
    final elapsed = DateTime.now().difference(_exerciseStarted).inMilliseconds;
    // Kártya-típusú feladat → SRS-mentés a hívón keresztül.
    if (item != null &&
        (item.type == LessonExerciseType.flip ||
            item.type == LessonExerciseType.choice ||
            item.type == LessonExerciseType.type) &&
        widget.onSrsReview != null) {
      widget
          .onSrsReview!(
            type: item.type,
            prompt: item.prompt,
            answer: item.answer,
            correct: correct,
            elapsedMs: elapsed,
          )
          .catchError((_) {});
    }
    setState(
      () => _feedback = correct ? 'ok' : 'no${expected == null ? '' : '|$expected'}',
    );
    Future<void>.delayed(const Duration(milliseconds: 1100), () {
      if (!mounted) return;
      if (_index >= widget.exercises.length - 1) {
        setState(() => _done = true);
        return;
      }
      setState(() {
        _index += 1;
        _prepare();
      });
    });
  }

  String? get _feedbackExpected {
    final fb = _feedback;
    if (fb == null || !fb.startsWith('no|')) return null;
    return fb.substring(3);
  }

  bool get _feedbackOk => _feedback == 'ok';

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    if (widget.exercises.isEmpty) {
      return Center(child: Text(l10n.emptyPractice, style: Theme.of(context).textTheme.bodyMedium));
    }
    if (_done) {
      final total = widget.exercises.length;
      final percent = total == 0 ? 0 : ((_correct / total) * 100).round();
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(l10n.practiceScore, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                l10n.practiceResult(_correct, total),
                style: Theme.of(context).textTheme.displaySmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text(
                '$percent%',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: context.ink.inkMuted,
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () {
                  setState(() {
                    _index = 0;
                    _correct = 0;
                    _done = false;
                    _prepare();
                  });
                },
                child: Text(l10n.retryPractice),
              ),
              TextButton(onPressed: widget.onFinished, child: Text(l10n.backToTopic)),
            ],
          ),
        ),
      );
    }
    final item = _current!;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              Text(l10n.exerciseLabel(item.type), style: Theme.of(context).textTheme.labelLarge),
              const Spacer(),
              Text('${_index + 1} / ${widget.exercises.length}'),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: SizedBox(
            height: 48,
            child: Center(
              child: _feedback == null
                  ? const SizedBox.shrink()
                  : FeedbackPill(
                      correct: _feedbackOk,
                      text: _feedbackOk
                          ? l10n.practiceCorrect
                          : (_feedbackExpected == null
                                ? l10n.practiceWrong
                                : l10n.correctIs(_feedbackExpected!)),
                    ),
            ),
          ),
        ),
        Expanded(child: Padding(padding: const EdgeInsets.all(16), child: _body(item, l10n))),
      ],
    );
  }

  Widget _body(LessonExerciseView item, L10n l10n) {
    return switch (item.type) {
      LessonExerciseType.flip => Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 340, maxWidth: 520),
            child: ZsoKartya(
              key: ValueKey(item.id),
              front: item.prompt,
              back: item.answer,
              stamp: l10n.exerciseFlip,
              frontHint: l10n.tapToFlip,
              onKnow: () => _advance(correct: true),
              onDontKnow: () => _advance(correct: false),
            ),
          ),
        ),
      LessonExerciseType.type => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(item.prompt, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextField(
              controller: _typed,
              enabled: _feedback == null,
              decoration: InputDecoration(labelText: l10n.cardBackLabel),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _feedback == null
                  ? () {
                      final ok = fuzzyMatch(_typed.text, item.answer);
                      _advance(
                        correct: ok,
                        expected: ok ? null : item.answer,
                      );
                    }
                  : null,
              child: Text(l10n.check),
            ),
          ],
        ),
      LessonExerciseType.choice => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(item.prompt, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            for (final option in _options(item))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    side: _picked == null
                        ? null
                        : option == item.answer
                        ? BorderSide(color: context.ink.forest, width: 2)
                        : option == _picked
                        ? BorderSide(color: context.ink.wine, width: 2)
                        : null,
                  ),
                  onPressed: _picked == null
                      ? () {
                          setState(() => _picked = option);
                          final ok = option == item.answer;
                          _advance(
                            correct: ok,
                            expected: ok ? null : item.answer,
                          );
                        }
                      : null,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (_picked != null && option == item.answer)
                        Icon(
                          Icons.check_circle_rounded,
                          color: context.ink.forest,
                          size: 20,
                        ),
                      if (_picked != null &&
                          option == _picked &&
                          option != item.answer)
                        Icon(
                          Icons.cancel_rounded,
                          color: context.ink.wine,
                          size: 20,
                        ),
                      if (_picked != null &&
                          (option == item.answer || option == _picked))
                        const SizedBox(width: 8),
                      Flexible(child: Text(option)),
                    ],
                  ),
                ),
              ),
          ],
        ),
      LessonExerciseType.match => _match(item, l10n),
      LessonExerciseType.order => _orderWidget(item, l10n),
    };
  }

  List<String> _options(LessonExerciseView item) {
    final raw = (item.payload['options'] as List? ?? []).whereType<String>().toList();
    if (raw.isEmpty) return [item.answer];
    return raw;
  }

  bool _rightDone(List<({String left, String right})> pairs, String right) {
    final total = pairs.where((pair) => pair.right == right).length;
    if (total == 0) return false;
    final done = pairs.indexed
        .where((entry) => entry.$2.right == right && _matched.contains(entry.$1))
        .length;
    return done >= total;
  }

  Widget _match(LessonExerciseView item, L10n l10n) {
    final pairs = [
      for (final pair in item.payload['pairs'] as List? ?? [])
        if (pair is Map) (left: pair['left'] as String? ?? '', right: pair['right'] as String? ?? ''),
    ];
    return Column(
      children: [
        if (item.prompt.isNotEmpty) Text(item.prompt, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.link_rounded, size: 14, color: context.ink.inkMuted),
            const SizedBox(width: 4),
            Text(
              '${_matched.length} / ${pairs.length}',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: context.ink.inkMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Expanded(
          child: Row(
            children: [
              Expanded(
                child: ListView(
                  children: [
                    for (final (index, pair) in pairs.indexed)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: OutlinedButton(
                          onPressed: _matched.contains(index)
                              ? null
                              : () => setState(() => _leftPick = index),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(48),
                            side: BorderSide(
                              color: _matched.contains(index)
                                  ? context.ink.forest
                                  : _leftPick == index
                                  ? context.ink.margin
                                  : context.ink.border,
                              width: _matched.contains(index) || _leftPick == index ? 2 : 1,
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (_matched.contains(index))
                                Icon(
                                  Icons.check_circle_rounded,
                                  color: context.ink.forest,
                                  size: 18,
                                ),
                              if (_matched.contains(index)) const SizedBox(width: 6),
                              Flexible(child: Text(pair.left)),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ListView(
                  children: [
                    for (final right in _rights)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Builder(
                          builder: (context) {
                            final done = _rightDone(pairs, right);
                            return OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size.fromHeight(48),
                                side: done
                                    ? BorderSide(color: context.ink.forest, width: 2)
                                    : null,
                              ),
                              onPressed: done
                                  ? null
                                  : () {
                                      final left = _leftPick;
                                      if (left == null) return;
                                      final expected = pairs[left].right;
                                      final ok = expected == right;
                                      if (ok) {
                                        setState(() {
                                          _matched.add(left);
                                          _leftPick = null;
                                        });
                                        if (_matched.length == pairs.length) {
                                          _advance(correct: true);
                                        }
                                      } else {
                                        _advance(
                                          correct: false,
                                          expected: expected,
                                        );
                                      }
                                    },
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  if (done)
                                    Icon(
                                      Icons.check_circle_rounded,
                                      color: context.ink.forest,
                                      size: 18,
                                    ),
                                  if (done) const SizedBox(width: 6),
                                  Flexible(child: Text(right)),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _orderWidget(LessonExerciseView item, L10n l10n) {
    final expected = (item.payload['items'] as List? ?? []).whereType<String>().toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (item.prompt.isNotEmpty) Text(item.prompt, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        Expanded(
          child: ReorderableListView.builder(
            buildDefaultDragHandles: false,
            itemCount: _orderItems.length,
            onReorderItem: (oldIndex, newIndex) {
              setState(() {
                final value = _orderItems.removeAt(oldIndex);
                _orderItems.insert(newIndex, value);
              });
            },
            itemBuilder: (context, index) {
              final entry = _orderItems[index];
              return ListTile(
                key: ValueKey('order-${entry.id}'),
                title: Text(entry.text),
                trailing: ReorderableDragStartListener(
                  index: index,
                  child: const Padding(
                    padding: EdgeInsets.all(12),
                    child: Icon(Icons.drag_handle_rounded),
                  ),
                ),
              );
            },
          ),
        ),
        FilledButton(
          onPressed: () => _advance(
            correct:
                _orderItems.map((entry) => entry.text).join('|') ==
                expected.join('|'),
          ),
          child: Text(l10n.check),
        ),
      ],
    );
  }
}
