import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/design_system/components/streak_tally.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ink = context.ink;
    final l10n = L10n.of(context);
    final home = ref.watch(homeProvider);
    final reminder = ref.watch(reminderProvider);
    final user = ref.watch(authProvider).user;
    return home.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text(l10n.apiError(error.toString()))),
      data: (snap) {
        final now = TimeOfDay.now();
        final pastReminder = now.hour > reminder.hour || (now.hour == reminder.hour && now.minute >= reminder.minute);
        final goal = ref.watch(dailyGoalProvider);
        final goalLeft = goal - snap.reviewedToday;
        final showReminder = reminder.enabled && pastReminder && goalLeft > 0;
        final firstName = user?.username.trim().split(RegExp(r'\s+')).first ?? '';
        final dateLabel = MaterialLocalizations.of(context).formatFullDate(DateTime.now());
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            Text(dateLabel, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: ink.inkMuted)),
            const SizedBox(height: 4),
            Text(
              firstName.isEmpty ? l10n.homeReady : l10n.helloName(firstName),
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            if (showReminder) ...[
              const SizedBox(height: 12),
              AppCard(
                child: Row(
                  children: [
                    Icon(Icons.notifications_active_outlined, color: ink.margin),
                    const SizedBox(width: 12),
                    Expanded(child: Text(l10n.goalRemaining(goalLeft))),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            _ProgressCard(snap: snap, goal: goal),
            if (snap.dueDecks.isNotEmpty) ...[
              const SizedBox(height: 22),
              Text(l10n.dueDecks, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 10),
              for (final deck in snap.dueDecks) ...[
                AppCard(
                  onTap: () => context.push('/kartyak/${deck.id}'),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(deck.name, style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 4),
                            Text(
                              l10n.dueCards(deck.dueCount, deck.cardCount),
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: ink.inkMuted),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: l10n.startPractice,
                        visualDensity: VisualDensity.compact,
                        onPressed: () => context.push(
                          '/gyakorlas/${deck.id}?mod=flip',
                        ),
                        icon: const Icon(Icons.play_arrow_rounded),
                      ),
                      Icon(Icons.chevron_right_rounded, color: ink.graphite),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ],
            if (snap.continueBundle != null) ...[
              const SizedBox(height: 12),
              AppCard(
                onTap: () {
                  final bundle = snap.continueBundle!;
                  final lessonId = snap.continueLessonId ?? bundle.firstLessonId;
                  if (lessonId == null) {
                    context.push('/tanulas/${bundle.id}');
                    return;
                  }
                  context.push('/tanulas/${bundle.id}/lecke/$lessonId');
                },
                child: Row(
                  children: [
                    Icon(Icons.menu_book_outlined, color: ink.margin),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l10n.continueLesson, style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 4),
                          Text(snap.continueBundle!.title, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: ink.inkMuted)),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: ink.graphite),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            AppCard(
              padding: EdgeInsets.zero,
              child: ExpansionTile(
                title: Text(l10n.last28),
                initiallyExpanded: false,
                childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                children: [
                  Row(
                    children: [
                      for (final day in _weekdayLabels(context))
                        Expanded(
                          child: Text(
                            day,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.labelSmall,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: snap.last28.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 7,
                      mainAxisSpacing: 6,
                      crossAxisSpacing: 6,
                    ),
                    itemBuilder: (context, index) {
                      final n = snap.last28[index];
                      return DecoratedBox(
                        decoration: BoxDecoration(
                          color: n == 0 ? ink.paperSunken : ink.margin.withValues(alpha: (0.22 + n / 8).clamp(0.22, 1)),
                          borderRadius: BorderRadius.circular(6),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  List<String> _weekdayLabels(BuildContext context) {
    final names = MaterialLocalizations.of(context).narrowWeekdays;
    final start = DateTime.now().subtract(const Duration(days: 27));
    return [
      for (var i = 0; i < 7; i++) names[start.add(Duration(days: i)).weekday % 7],
    ];
  }
}

/// Haladás-kártya a főoldal tetején: nagy esedékes-szám,
/// egygombos gyakorlás-indítás (egyből a kártyákra visz),
/// alatta a mai számok és a sorozat.
class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.snap, required this.goal});

  final HomeSnapshot snap;
  final int goal;

  @override
  Widget build(BuildContext context) {
    final ink = context.ink;
    final l10n = L10n.of(context);
    final due = snap.dueToday;
    final done = snap.reviewedToday;
    final progress = goal <= 0 ? 0.0 : (done / goal).clamp(0.0, 1.0);
    final goalLeft = goal - done;
    return AppCard(
      padding: const EdgeInsets.fromLTRB(22, 20, 22, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.progressSection,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            due == 0 ? l10n.caughtUp : l10n.cardsCount(due),
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
              fontSize: 38,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            due == 0 ? l10n.homeReady : l10n.dueLabel,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: ink.inkMuted),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              textStyle: Theme.of(context).textTheme.titleMedium,
            ),
            onPressed: () {
              if (snap.dueDecks.isNotEmpty) {
                // Egyből a gyakorlás indul (csak az esedékes lapok).
                context.push('/gyakorlas/${snap.dueDecks.first.id}?mod=flip');
              } else {
                context.go('/kartyak');
              }
            },
            icon: Icon(due == 0 ? Icons.style_rounded : Icons.play_arrow_rounded),
            label: Text(due == 0 ? l10n.studyToday : l10n.startPractice),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Text(
                  '$done / $goal',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Text(
                goalLeft <= 0 ? l10n.goalDone : l10n.goalRemaining(goalLeft),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: goalLeft <= 0 ? ink.forest : ink.inkMuted,
                  fontWeight: goalLeft <= 0 ? FontWeight.w700 : null,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _StatChip(value: '${snap.dueToday}', label: l10n.dueLabel)),
              const SizedBox(width: 10),
              Expanded(child: _StatChip(value: '$done', label: l10n.doneToday)),
            ],
          ),
          const SizedBox(height: 10),
          AppCard(child: StreakTally(days: snap.streak)),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final ink = context.ink;
    return AppCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 4),
          Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: ink.inkMuted)),
        ],
      ),
    );
  }
}
