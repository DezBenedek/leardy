import 'package:flutter/material.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';

/// Térerő-szerű tudásszint-jelző a 0-4-es számlálóból.
///
/// 0 csík = még semmi (üres), 1 csík + piros, 2–3 csík + sárga,
/// 4 csík + zöld.
class KnowledgeSignal extends StatelessWidget {
  const KnowledgeSignal({
    super.key,
    required this.level,
    this.height = 14,
    this.semanticLabel,
  });

  final int level;
  final double height;
  final String? semanticLabel;

  int get bars => level.clamp(0, 4);

  @override
  Widget build(BuildContext context) {
    final ink = context.ink;
    final filled = bars;
    final color = switch (filled) {
      4 => ink.forest,
      1 => ink.wine,
      _ => ink.brass,
    };
    final empty = ink.graphite.withValues(alpha: 0.3);
    return Semantics(
      label: semanticLabel,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (var i = 0; i < 4; i++)
            Container(
              width: 3,
              height: height * (0.35 + 0.65 * (i + 1) / 4),
              margin: EdgeInsets.only(left: i == 0 ? 0 : 2),
              decoration: BoxDecoration(
                color: i < filled ? color : empty,
                borderRadius: BorderRadius.circular(1.5),
              ),
            ),
        ],
      ),
    );
  }
}
