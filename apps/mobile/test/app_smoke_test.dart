import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/data/auth/session_store.dart';
import 'package:leardy/data/library_store.dart';
import 'package:leardy/data/local/database.dart';
import 'package:leardy/design_system/theme/app_theme.dart';
import 'package:leardy/features/home/home_page.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

void main() {
  testWidgets('home shows today title after seed', (tester) async {
    final db = LeardyDatabase(NativeDatabase.memory());
    await LibraryStore(db).seedIfEmpty();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWith((ref) => db),
          sessionStoreProvider.overrideWith((ref) => _FakeSessionStore()),
        ],
        child: MaterialApp(
          theme: LeardyTheme.light,
          locale: const Locale('hu'),
          supportedLocales: L10n.supported,
          localizationsDelegates: const [
            L10n.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const HomePage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Gyakorlás kezdése'), findsOneWidget);
    expect(find.text('Haladás'), findsOneWidget);
    // A sorozat a kinyitott Haladás-kártyában egyből látszik.
    await tester.ensureVisible(find.text('Sorozat'));
    await tester.pumpAndSettle();
    expect(find.text('Sorozat'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await db.close();
  });
}

class _FakeSessionStore extends SessionStore {
  @override
  Future<String?> token() async => null;

  @override
  Future<({String id, String username, String? email, bool isTeacher})?> user() async =>
      null;

  @override
  Future<void> save({
    required String token,
    required String id,
    required String username,
    String? email,
    bool isTeacher = false,
  }) async {}

  @override
  Future<void> clear() async {}
}
