import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/design_system/components/session_scaffold.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/domain/srs.dart';
import 'package:leardy/features/study/lesson_body_text.dart';
import 'package:leardy/features/study/lesson_practice_panel.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class LessonReaderPage extends ConsumerStatefulWidget {
  const LessonReaderPage({
    super.key,
    required this.bundleId,
    required this.lessonId,
    this.startPractice = false,
  });

  final String bundleId;
  final String lessonId;
  final bool startPractice;

  @override
  ConsumerState<LessonReaderPage> createState() => _LessonReaderPageState();
}

class _LessonReaderPageState extends ConsumerState<LessonReaderPage> {
  final _pager = PageController();
  List<LessonPageView> _pages = [];
  List<LessonExerciseView> _exercises = [];
  List<CardView> _cards = [];
  var _index = 0;
  var _practice = false;
  var _hasNextLesson = false;

  @override
  void initState() {
    super.initState();
    _practice = widget.startPractice;
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _pager.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final library = ref.read(libraryProvider);
    final pages = await library.pagesForLesson(widget.lessonId);
    final exercises = await library.exercisesForLesson(widget.lessonId);
    final lessons = await library.lessonsForBundle(widget.bundleId);
    final bundle = await library.bundleById(
      widget.bundleId,
      ref.read(libraryUserIdProvider),
    );
    final cards = bundle?.cardsSetId == null
        ? const <CardView>[]
        : await library.cardsForDeck(bundle!.cardsSetId!);
    if (!mounted) return;
    setState(() {
      _pages = pages;
      _exercises = exercises;
      _cards = cards;
      _hasNextLesson = lessons.any(
        (item) => item.id != widget.lessonId && !item.completed,
      );
    });
  }

  /// Lecke-feladat SRS-mentése: a csomag kártyái közül párosítjuk
  /// a feladatot (kérdés+válasz alapján), és arra könyveljük az értékelést.
  Future<void> _srsReview({
    required LessonExerciseType type,
    required String prompt,
    required String answer,
    required bool correct,
    required int elapsedMs,
  }) async {
    final card = _cards.firstWhereOrNull(
      (c) =>
          normalizeAnswer(c.front) == normalizeAnswer(prompt) &&
          normalizeAnswer(c.back) == normalizeAnswer(answer),
    );
    if (card == null) return;
    final mode = switch (type) {
      LessonExerciseType.flip => PracticeMode.flip,
      LessonExerciseType.choice => PracticeMode.choice,
      LessonExerciseType.type => PracticeMode.type,
      _ => null,
    };
    if (mode == null) return;
    final grade = switch (mode) {
      PracticeMode.flip => correct ? ReviewGrade.good : ReviewGrade.again,
      PracticeMode.choice => gradeFromChoice(
        correct: correct,
        elapsedMs: elapsedMs,
      ),
      PracticeMode.type => gradeFromTyped(
        correct: correct,
        elapsedMs: elapsedMs,
      ),
      PracticeMode.quiz => ReviewGrade.good,
    };
    await ref
        .read(libraryProvider)
        .recordReview(
          card: card,
          grade: grade,
          mode: mode,
          wasCorrect: correct,
          elapsedMs: elapsedMs,
        );
    if (mounted) ref.invalidate(homeProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    if (_practice) {
      return SessionScaffold(
        progress: _exercises.isEmpty ? null : 1,
        onBack: () => context.pop(),
        body: LessonPracticePanel(
          key: ValueKey('${widget.lessonId}-${_exercises.length}'),
          exercises: _exercises,
          onFinished: () => context.go('/tanulas/${widget.bundleId}'),
          onSrsReview: _srsReview,
        ),
      );
    }
    if (_pages.isEmpty) {
      return SessionScaffold(
        onBack: () => context.pop(),
        body: Center(
          child: Text(
            l10n.emptyTopic,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      );
    }
    final last = _index >= _pages.length - 1;
    return SessionScaffold(
      progress: (_index + 1) / _pages.length,
      onBack: () => context.pop(),
      body: Column(
        children: [
          Expanded(
            child: PageView.builder(
              controller: _pager,
              onPageChanged: (value) => setState(() => _index = value),
              itemCount: _pages.length,
              itemBuilder: (context, index) => _step(_pages[index]),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
              child: FilledButton(
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(54),
                  textStyle: Theme.of(context).textTheme.titleMedium,
                ),
                onPressed: last ? _finish : _next,
                child: Text(
                  last
                      ? (_hasNextLesson ? l10n.nextLesson : l10n.lessonDone)
                      : l10n.nextPage,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _step(LessonPageView page) {
    final ink = context.ink;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        switch (page.type) {
          LessonStepType.fact => Card(
            color: ink.margin.withValues(alpha: 0.10),
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: LessonBodyText(
                body: page.body,
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(height: 1.4),
              ),
            ),
          ),
          LessonStepType.source => LessonBodyText(
            body: page.body,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              fontStyle: FontStyle.italic,
              height: 1.6,
              fontSize: 17,
            ),
          ),
          LessonStepType.prompt => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LessonBodyText(
                body: page.body,
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(height: 1.4),
              ),
              if ((page.payload['answer'] as String?)?.isNotEmpty == true) ...[
                const SizedBox(height: 16),
                LessonBodyText(
                  body: page.payload['answer'] as String,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: ink.inkMuted,
                    height: 1.5,
                  ),
                ),
              ],
            ],
          ),
          LessonStepType.text => LessonBodyText(
            body: page.body,
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(height: 1.6, fontSize: 17),
          ),
        },
      ],
    );
  }

  void _next() {
    _pager.nextPage(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _finish() async {
    await ref.read(libraryProvider).markLessonDone(widget.lessonId);
    final bundle = await ref
        .read(libraryProvider)
        .bundleById(widget.bundleId, ref.read(libraryUserIdProvider));
    if (!mounted) return;
    final nextId = bundle?.incompleteLessonId;
    if (nextId != null && nextId != widget.lessonId) {
      context.pushReplacement('/tanulas/${widget.bundleId}/lecke/$nextId');
      return;
    }
    if (_exercises.isNotEmpty) {
      setState(() => _practice = true);
      return;
    }
    context.pop();
  }
}
