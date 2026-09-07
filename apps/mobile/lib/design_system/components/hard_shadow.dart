import 'package:flutter/material.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';

class HardSheet extends StatelessWidget {
  const HardSheet({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final ink = context.ink;
    return Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ink.paperRaised,
        boxShadow: [
          BoxShadow(
            color: ink.ink.withValues(alpha: 0.12),
            offset: const Offset(4, 6),
            blurRadius: 0,
          ),
        ],
      ),
      child: child,
    );
  }
}
