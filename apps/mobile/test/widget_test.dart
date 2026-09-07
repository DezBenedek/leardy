import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/design_system/components/session_scaffold.dart';
import 'package:leardy/design_system/components/streak_tally.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/theme/app_theme.dart';

void main() {
  testWidgets('streak tally paints the series label', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LeardyTheme.light,
        home: const Scaffold(body: StreakTally(days: 6)),
      ),
    );
    expect(find.text('Sorozat'), findsOneWidget);
    expect(find.text('6'), findsOneWidget);
  });

  testWidgets('popAppSheet returns a value from the page context', (
    tester,
  ) async {
    String? picked;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            return Scaffold(
              body: TextButton(
                onPressed: () async {
                  picked = await showAppSheet<String>(
                    context: context,
                    title: 'Pick',
                    child: TextButton(
                      onPressed: () => popAppSheet(context, 'ok'),
                      child: const Text('choose'),
                    ),
                  );
                },
                child: const Text('open'),
              ),
            );
          },
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('choose'));
    await tester.pumpAndSettle();
    expect(picked, 'ok');
  });

  testWidgets('session chrome stays below the status bar', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) {
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(
              padding: const EdgeInsets.only(top: 48),
              viewPadding: const EdgeInsets.only(top: 48),
            ),
            child: child!,
          );
        },
        home: const SessionScaffold(
          progress: 0.4,
          body: Center(child: Text('lecke')),
        ),
      ),
    );
    expect(
      tester.getTopLeft(find.byType(LinearProgressIndicator)).dy,
      greaterThanOrEqualTo(48),
    );
    expect(
      tester.getTopLeft(find.byType(IconButton)).dy,
      greaterThanOrEqualTo(48),
    );
  });
}
