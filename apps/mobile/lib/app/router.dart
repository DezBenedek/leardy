import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/design_system/components/adaptive_shell.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/features/cards/card_search_page.dart';
import 'package:leardy/features/cards/cards_page.dart';
import 'package:leardy/features/cards/deck_page.dart';
import 'package:leardy/features/classroom/class_detail_page.dart';
import 'package:leardy/features/classroom/class_settings_page.dart';
import 'package:leardy/features/classroom/classroom_page.dart';
import 'package:leardy/features/classroom/quiz_page.dart';
import 'package:leardy/features/home/home_page.dart';
import 'package:leardy/features/practice/practice_page.dart';
import 'package:leardy/features/settings/settings_page.dart';
import 'package:leardy/features/study/bundle_page.dart';
import 'package:leardy/features/study/lesson_editor_page.dart';
import 'package:leardy/features/study/lesson_reader_page.dart';
import 'package:leardy/features/study/map_practice_page.dart';
import 'package:leardy/providers.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ValueNotifier(ref.read(authProvider));
  ref.listen(authProvider, (_, next) => auth.value = next);
  ref.onDispose(auth.dispose);

  return GoRouter(
    refreshListenable: auth,
    initialLocation: '/',
    redirect: (context, state) {
      if (!auth.value.ready) return null;
      final loggedIn = auth.value.isAuthenticated;
      final inClassroom = state.uri.path.startsWith('/tanterem');
      if (inClassroom && !loggedIn) return '/beallitasok';
      return null;
    },
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return AdaptiveShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: '/', builder: (context, state) => const HomePage())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/kartyak', builder: (context, state) => const CardsPage())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/tanterem', builder: (context, state) => const ClassroomPage())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/beallitasok', builder: (context, state) => const SettingsPage())],
          ),
        ],
      ),
      GoRoute(
        path: '/kereses',
        builder: (context, state) => const CardSearchPage(),
      ),
      GoRoute(
        path: '/kartyak/:deckId',
        builder: (context, state) => DeckPage(deckId: state.pathParameters['deckId']!),
      ),
      GoRoute(
        path: '/tanulas/:bundleId',
        builder: (context, state) => BundlePage(
          bundleId: state.pathParameters['bundleId']!,
          startEditing: state.uri.queryParameters['szerkeszt'] == '1',
        ),
      ),
      GoRoute(
        path: '/tanulas/:bundleId/lecke/:lessonId',
        builder: (context, state) {
          final bundleId = state.pathParameters['bundleId']!;
          final lessonId = state.pathParameters['lessonId']!;
          final practice = state.uri.queryParameters['tab'] == 'gyakorlas';
          if (state.uri.queryParameters['szerkeszt'] == '1') {
            return LessonEditorPage(bundleId: bundleId, lessonId: lessonId, practice: practice);
          }
          return LessonReaderPage(bundleId: bundleId, lessonId: lessonId, startPractice: practice);
        },
      ),
      GoRoute(
        path: '/tanulas/:bundleId/terkep/:activityId',
        builder: (context, state) => MapPracticePage(
          bundleId: state.pathParameters['bundleId']!,
          activityId: state.pathParameters['activityId']!,
        ),
      ),
      GoRoute(
        path: '/gyakorlas/:deckId',
        builder: (context, state) {
          final raw = state.uri.queryParameters['mod'] ?? 'flip';
          final mode = PracticeMode.values.firstWhere((m) => m.name == raw, orElse: () => PracticeMode.flip);
          return PracticePage(deckId: state.pathParameters['deckId']!, mode: mode);
        },
      ),
      GoRoute(
        path: '/tanterem/:classId',
        builder: (context, state) => ClassDetailPage(classId: state.pathParameters['classId']!),
      ),
      GoRoute(
        path: '/tanterem/:classId/beallitasok',
        builder: (context, state) => ClassSettingsPage(classId: state.pathParameters['classId']!),
      ),
      GoRoute(
        path: '/tanterem/:classId/doga/:sessionId',
        builder: (context, state) => QuizPage(
          classId: state.pathParameters['classId']!,
          sessionId: state.pathParameters['sessionId']!,
          teacherHint: state.uri.queryParameters['tanar'] == '1',
        ),
      ),
    ],
  );
});
