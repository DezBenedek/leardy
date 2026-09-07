import 'package:flutter/material.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/design_system/theme/type.dart';
import 'package:leardy/l10n/l10n.dart';

class StreakTally extends StatelessWidget {
  const StreakTally({super.key, required this.days});

  final int days;

  @override
  Widget build(BuildContext context) {
    final ink = context.ink;
    final l10n = L10n.of(context);
    return Row(
      children: [
        Container(
          width: 52,
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: ink.margin.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            '$days',
            style: LeardyType.ui(size: 22, weight: FontWeight.w700, color: ink.margin),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.streak, style: Theme.of(context).textTheme.titleMedium),
              Text(
                days == 0 ? l10n.streakNone : l10n.streakDays(days),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: ink.inkMuted),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
