import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/toast.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/features/cards/library_query.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

BundleView _bundle({
  required String id,
  required String kind,
  required String title,
  String subject = 'Angol',
  bool saved = false,
}) {
  return BundleView(
    id: id,
    kind: kind,
    subject: subject,
    title: title,
    status: 'public',
    saved: saved,
  );
}

void main() {
  test('discover hides saved bundles and applies filters', () {
    final saved = _bundle(
      id: '1',
      kind: 'topic',
      title: 'Honfoglalás',
      subject: 'Történelem',
      saved: true,
    );
    final topic = _bundle(
      id: '2',
      kind: 'topic',
      title: 'Sejt',
      subject: 'Biológia',
    );
    final skill = _bundle(
      id: '3',
      kind: 'skill',
      title: 'Igék',
      subject: 'Angol',
    );

    expect(
      bundleMatchesQuery(
        bundle: saved,
        search: '',
        query: const CardsQuery(),
        discover: true,
      ),
      isFalse,
    );
    expect(
      bundleMatchesQuery(
        bundle: topic,
        search: '',
        query: const CardsQuery(),
        discover: true,
      ),
      isTrue,
    );
    expect(
      bundleMatchesQuery(
        bundle: skill,
        search: '',
        query: const CardsQuery(kind: 'topic'),
        discover: true,
      ),
      isFalse,
    );
    expect(
      bundleMatchesQuery(
        bundle: skill,
        search: '',
        query: const CardsQuery(kind: 'skill'),
        discover: true,
      ),
      isTrue,
    );
    expect(
      bundleMatchesQuery(
        bundle: skill,
        search: '',
        query: const CardsQuery(subjectId: 'angol'),
        discover: false,
        subjectName: 'Angol',
      ),
      isTrue,
    );
    expect(
      bundleMatchesQuery(
        bundle: topic,
        search: '',
        query: const CardsQuery(subjectId: 'angol'),
        discover: false,
        subjectName: 'Angol',
      ),
      isFalse,
    );
    expect(
      bundleMatchesQuery(
        bundle: skill,
        search: 'ig',
        query: const CardsQuery(classId: 'c1'),
        discover: false,
        classBundleIds: {'3'},
      ),
      isTrue,
    );
    expect(
      bundleMatchesQuery(
        bundle: skill,
        search: '',
        query: const CardsQuery(classId: 'c1'),
        discover: false,
        classBundleIds: {'other'},
      ),
      isFalse,
    );
  });

  test('classroom students exclude teachers and the owner', () {
    const classroom = Classroom(
      id: 'c1',
      name: '7.a',
      role: 'teacher',
      allowStudentSets: false,
      memberCount: 3,
      ownerId: 't1',
      members: [
        ClassMember(userId: 't1', username: 'Tanár', role: 'teacher'),
        ClassMember(userId: 't2', username: 'Másik tanár', role: 'teacher'),
        ClassMember(userId: 's1', username: 'Diák', role: 'student'),
      ],
    );
    expect(classroomStudents(classroom).map((m) => m.userId), ['s1']);
    expect(classroom.students.map((m) => m.userId), ['s1']);
  });

  test('toast stays longer for longer error text', () {
    expect(
      toastDurationFor('Mentve').inMilliseconds,
      lessThan(
        toastDurationFor('A Leardy nem érte el a szervert.').inMilliseconds,
      ),
    );
    expect(
      toastDurationFor('A Leardy nem érte el a szervert.').inMilliseconds,
      greaterThan(toastDurationFor('OK').inMilliseconds),
    );
  });

  test('cards query tracks kind and active filters', () {
    const empty = CardsQuery();
    expect(empty.hasFilters, isFalse);
    final next = empty.copyWith(kind: 'topic', subjectId: 's1');
    expect(next.hasFilters, isTrue);
    expect(next.kind, 'topic');
    expect(
      next.copyWith(clearKind: true, clearSubject: true).hasFilters,
      isFalse,
    );
  });

  testWidgets('compact sheet stays short, picker sheet expands', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('hu'),
        supportedLocales: L10n.supported,
        localizationsDelegates: const [
          L10n.delegate,
          ...GlobalMaterialLocalizations.delegates,
        ],
        home: Builder(
          builder: (context) {
            return Scaffold(
              body: Column(
                children: [
                  TextButton(
                    onPressed: () => showAppSheet(
                      context: context,
                      title: 'Kompakt',
                      child: const Text('kis tartalom'),
                    ),
                    child: const Text('open-compact'),
                  ),
                  TextButton(
                    onPressed: () => showAppSheet(
                      context: context,
                      title: 'Lista',
                      expand: true,
                      child: Column(
                        children: [
                          for (var i = 0; i < 24; i++)
                            ListTile(title: Text('sor $i')),
                        ],
                      ),
                    ),
                    child: const Text('open-expand'),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );

    await tester.tap(find.text('open-compact'));
    await tester.pumpAndSettle();
    expect(find.text('kis tartalom'), findsOneWidget);
    final compact = tester.getSize(
      find
          .ancestor(
            of: find.text('kis tartalom'),
            matching: find.byType(ConstrainedBox),
          )
          .first,
    );
    expect(compact.height, lessThan(260));
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();

    await tester.tap(find.text('open-expand'));
    await tester.pumpAndSettle();
    expect(find.text('sor 0'), findsOneWidget);
    final expanded = tester.getSize(
      find
          .ancestor(
            of: find.text('sor 0'),
            matching: find.byType(ConstrainedBox),
          )
          .first,
    );
    expect(expanded.height, greaterThan(compact.height));
    expect(expanded.height, greaterThan(360));
  });

  testWidgets('multiline decoration aligns the label with the hint', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TextField(
            minLines: 4,
            maxLines: 8,
            decoration: appMultilineDecoration('Lecke szövege'),
          ),
        ),
      ),
    );
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.decoration?.alignLabelWithHint, isTrue);
    expect(
      field.decoration?.floatingLabelAlignment,
      FloatingLabelAlignment.start,
    );
  });
}
