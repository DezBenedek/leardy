import 'package:flutter/material.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/design_system/theme/type.dart';

abstract final class LeardyTheme {
  static ThemeData of(LeardyInk ink, Brightness brightness) {
    final radius = BorderRadius.circular(14);
    final scheme = ColorScheme(
      brightness: brightness,
      primary: ink.margin,
      onPrimary: brightness == Brightness.light ? Colors.white : const Color(0xFF042F2E),
      secondary: ink.rule,
      onSecondary: Colors.white,
      error: ink.wine,
      onError: Colors.white,
      surface: ink.paper,
      onSurface: ink.ink,
      surfaceContainerHighest: ink.paperSunken,
      outline: ink.border,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      fontFamily: 'BricolageGrotesque',
      colorScheme: scheme,
      scaffoldBackgroundColor: ink.paper,
      canvasColor: ink.paperRaised,
      splashFactory: InkRipple.splashFactory,
      visualDensity: VisualDensity.standard,
      extensions: [ink],
      textTheme: TextTheme(
        displayLarge: LeardyType.ui(size: 40, weight: FontWeight.w700, color: ink.ink, height: 1.1),
        headlineMedium: LeardyType.ui(size: 26, weight: FontWeight.w700, color: ink.ink, height: 1.15),
        titleLarge: LeardyType.ui(size: 20, weight: FontWeight.w600, color: ink.ink),
        titleMedium: LeardyType.ui(size: 16, weight: FontWeight.w600, color: ink.ink),
        bodyLarge: LeardyType.ui(size: 16, weight: FontWeight.w400, color: ink.ink),
        bodyMedium: LeardyType.ui(size: 14, weight: FontWeight.w400, color: ink.ink),
        labelLarge: LeardyType.ui(size: 14, weight: FontWeight.w600, color: ink.ink),
        labelSmall: LeardyType.ui(size: 12, weight: FontWeight.w500, color: ink.inkMuted),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: ink.paper,
        foregroundColor: ink.ink,
        elevation: 0,
        scrolledUnderElevation: 0.4,
        centerTitle: false,
        titleTextStyle: LeardyType.ui(size: 20, weight: FontWeight.w700, color: ink.ink),
      ),
      cardTheme: CardThemeData(
        color: ink.paperRaised,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: ink.border),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        elevation: 0,
        backgroundColor: ink.paperRaised,
        indicatorColor: ink.margin.withValues(alpha: 0.14),
        labelTextStyle: WidgetStatePropertyAll(LeardyType.ui(size: 12, weight: FontWeight.w600, color: ink.ink)),
      ),
      navigationDrawerTheme: NavigationDrawerThemeData(
        backgroundColor: ink.paperRaised,
        indicatorColor: ink.margin.withValues(alpha: 0.14),
        indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        tileHeight: 48,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: ink.paperSunken,
        alignLabelWithHint: true,
        floatingLabelAlignment: FloatingLabelAlignment.start,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: ink.border)),
        enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: ink.border)),
        focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: ink.margin, width: 1.4)),
        labelStyle: LeardyType.ui(size: 13, color: ink.inkMuted),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: radius),
          textStyle: LeardyType.ui(size: 14, weight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: radius),
          side: BorderSide(color: ink.border),
          textStyle: LeardyType.ui(size: 14, weight: FontWeight.w600),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: ink.margin,
        foregroundColor: scheme.onPrimary,
        elevation: 1,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      dividerTheme: DividerThemeData(color: ink.border, space: 1),
      chipTheme: ChipThemeData(
        labelStyle: LeardyType.ui(size: 12, weight: FontWeight.w600, color: ink.ink),
        backgroundColor: ink.paperSunken,
        side: BorderSide(color: ink.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
      ),
      listTileTheme: ListTileThemeData(
        dense: true,
        visualDensity: VisualDensity.compact,
        minVerticalPadding: 6,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        iconColor: ink.inkMuted,
        titleTextStyle: LeardyType.ui(size: 15, weight: FontWeight.w600, color: ink.ink),
        subtitleTextStyle: LeardyType.ui(size: 13, weight: FontWeight.w400, color: ink.inkMuted),
      ),
      switchTheme: SwitchThemeData(
        trackOutlineColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return Colors.transparent;
          return ink.graphite.withValues(alpha: 0.7);
        }),
        trackOutlineWidth: const WidgetStatePropertyAll(1.4),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return ink.margin;
          return ink.paperSunken;
        }),
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return Colors.white;
          return ink.graphite;
        }),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: ink.paperRaised,
        modalBackgroundColor: ink.paperRaised,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        showDragHandle: true,
        dragHandleColor: ink.border,
        clipBehavior: Clip.antiAlias,
        constraints: const BoxConstraints(minWidth: double.infinity, maxWidth: double.infinity),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: ZoomPageTransitionsBuilder(allowEnterRouteSnapshotting: false),
          TargetPlatform.iOS: ZoomPageTransitionsBuilder(allowEnterRouteSnapshotting: false),
          TargetPlatform.macOS: ZoomPageTransitionsBuilder(),
        },
      ),
    );
  }

  static ThemeData get light => of(LeardyInk.light, Brightness.light);
  static ThemeData get dark => of(LeardyInk.dark, Brightness.dark);
}
