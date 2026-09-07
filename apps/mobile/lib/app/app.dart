import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:leardy/app/router.dart';
import 'package:leardy/design_system/theme/app_theme.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class LeardyApp extends ConsumerWidget {
  const LeardyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);
    return MaterialApp.router(
      title: 'Leardy',
      debugShowCheckedModeBanner: false,
      theme: LeardyTheme.light,
      darkTheme: LeardyTheme.dark,
      themeMode: themeMode,
      locale: locale,
      supportedLocales: L10n.supported,
      localizationsDelegates: const [
        L10n.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    );
  }
}
