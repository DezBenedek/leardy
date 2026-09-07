import 'package:flutter/material.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/design_system/theme/type.dart';

class SubjectTab extends StatelessWidget {
  const SubjectTab({
    super.key,
    required this.label,
    required this.colorKey,
    required this.selected,
    required this.count,
    required this.onTap,
  });

  final String label;
  final String colorKey;
  final bool selected;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ink = context.ink;
    final wash = ink.subjectColor(colorKey).withValues(alpha: 0.18);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        height: 36,
        padding: const EdgeInsets.fromLTRB(10, 0, 12, 0),
        decoration: BoxDecoration(
          color: wash,
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: ink.ink.withValues(alpha: 0.12),
                    offset: const Offset(4, 6),
                    blurRadius: 0,
                  ),
                ]
              : null,
        ),
        child: CustomPaint(
          painter: _TabEarPainter(wash),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (selected)
                Container(
                  width: 3,
                  height: 18,
                  margin: const EdgeInsets.only(right: 8),
                  color: ink.margin,
                ),
              Text(
                label.toUpperCase(),
                style: LeardyType.bricolage(size: 12, color: ink.ink, letterSpacing: 0.08),
              ),
              const SizedBox(width: 8),
              Text(
                '$count',
                style: LeardyType.newsreader(size: 13, color: ink.inkMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabEarPainter extends CustomPainter {
  _TabEarPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(0, size.height)
      ..lineTo(0, 0)
      ..lineTo(size.width - 8, 0)
      ..lineTo(size.width, 8)
      ..lineTo(size.width, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _TabEarPainter oldDelegate) => oldDelegate.color != color;
}
