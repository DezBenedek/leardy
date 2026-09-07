import 'package:flutter/material.dart';

@immutable
class LeardyInk extends ThemeExtension<LeardyInk> {
  const LeardyInk({
    required this.paper,
    required this.paperRaised,
    required this.paperSunken,
    required this.ink,
    required this.inkMuted,
    required this.graphite,
    required this.margin,
    required this.rule,
    required this.brass,
    required this.forest,
    required this.wine,
    required this.blotter,
    required this.border,
  });

  final Color paper;
  final Color paperRaised;
  final Color paperSunken;
  final Color ink;
  final Color inkMuted;
  final Color graphite;
  final Color margin;
  final Color rule;
  final Color brass;
  final Color forest;
  final Color wine;
  final Color blotter;
  final Color border;

  static const light = LeardyInk(
    paper: Color(0xFFF7F7F8),
    paperRaised: Color(0xFFFFFFFF),
    paperSunken: Color(0xFFF4F4F5),
    ink: Color(0xFF09090B),
    inkMuted: Color(0xFF52525B),
    graphite: Color(0xFF71717A),
    margin: Color(0xFF0D9488),
    rule: Color(0xFF2563EB),
    brass: Color(0xFFD97706),
    forest: Color(0xFF16A34A),
    wine: Color(0xFFE11D48),
    blotter: Color(0xFF18181B),
    border: Color(0xFFE4E4E7),
  );

  static const dark = LeardyInk(
    paper: Color(0xFF09090B),
    paperRaised: Color(0xFF18181B),
    paperSunken: Color(0xFF27272A),
    ink: Color(0xFFFAFAFA),
    inkMuted: Color(0xFFA1A1AA),
    graphite: Color(0xFF71717A),
    margin: Color(0xFF2DD4BF),
    rule: Color(0xFF60A5FA),
    brass: Color(0xFFFBBF24),
    forest: Color(0xFF4ADE80),
    wine: Color(0xFFFB7185),
    blotter: Color(0xFF09090B),
    border: Color(0xFF27272A),
  );

  Color subjectColor(String key) {
    return switch (key) {
      'ochre' => brass,
      'slate' => rule,
      'forest' => forest,
      'wine' => wine,
      _ => graphite,
    };
  }

  @override
  LeardyInk copyWith({
    Color? paper,
    Color? paperRaised,
    Color? paperSunken,
    Color? ink,
    Color? inkMuted,
    Color? graphite,
    Color? margin,
    Color? rule,
    Color? brass,
    Color? forest,
    Color? wine,
    Color? blotter,
    Color? border,
  }) {
    return LeardyInk(
      paper: paper ?? this.paper,
      paperRaised: paperRaised ?? this.paperRaised,
      paperSunken: paperSunken ?? this.paperSunken,
      ink: ink ?? this.ink,
      inkMuted: inkMuted ?? this.inkMuted,
      graphite: graphite ?? this.graphite,
      margin: margin ?? this.margin,
      rule: rule ?? this.rule,
      brass: brass ?? this.brass,
      forest: forest ?? this.forest,
      wine: wine ?? this.wine,
      blotter: blotter ?? this.blotter,
      border: border ?? this.border,
    );
  }

  @override
  LeardyInk lerp(ThemeExtension<LeardyInk>? other, double t) {
    if (other is! LeardyInk) return this;
    return LeardyInk(
      paper: Color.lerp(paper, other.paper, t)!,
      paperRaised: Color.lerp(paperRaised, other.paperRaised, t)!,
      paperSunken: Color.lerp(paperSunken, other.paperSunken, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      inkMuted: Color.lerp(inkMuted, other.inkMuted, t)!,
      graphite: Color.lerp(graphite, other.graphite, t)!,
      margin: Color.lerp(margin, other.margin, t)!,
      rule: Color.lerp(rule, other.rule, t)!,
      brass: Color.lerp(brass, other.brass, t)!,
      forest: Color.lerp(forest, other.forest, t)!,
      wine: Color.lerp(wine, other.wine, t)!,
      blotter: Color.lerp(blotter, other.blotter, t)!,
      border: Color.lerp(border, other.border, t)!,
    );
  }
}

extension LeardyInkContext on BuildContext {
  LeardyInk get ink => Theme.of(this).extension<LeardyInk>() ?? LeardyInk.light;
}
