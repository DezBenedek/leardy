import 'dart:math' as math;

import 'package:flutter/material.dart';

class LeardyLeafPageTransitionsBuilder extends PageTransitionsBuilder {
  const LeardyLeafPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final reduce = MediaQuery.disableAnimationsOf(context);
    if (reduce) {
      return FadeTransition(opacity: animation, child: child);
    }

    final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
    return AnimatedBuilder(
      animation: curved,
      child: child,
      builder: (context, child) {
        final t = curved.value;
        final angle = (1 - t) * (8 * math.pi / 180);
        return Opacity(
          opacity: t.clamp(0.0, 1.0),
          child: Transform(
            alignment: Alignment.centerLeft,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.001)
              ..rotateY(-angle),
            child: child,
          ),
        );
      },
    );
  }
}

class FadeThrough extends StatelessWidget {
  const FadeThrough({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.disableAnimationsOf(context);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: reduce ? 1 : 0.94, end: 1),
      duration: Duration(milliseconds: reduce ? 0 : 180),
      curve: Curves.easeOut,
      builder: (context, scale, child) {
        return Opacity(
          opacity: reduce ? 1 : ((scale - 0.94) / 0.06).clamp(0.0, 1.0),
          child: Transform.scale(scale: scale, child: child),
        );
      },
      child: child,
    );
  }
}
