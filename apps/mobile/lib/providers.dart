import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:leardy/data/auth/session_store.dart';
import 'package:leardy/data/library_store.dart';
import 'package:leardy/data/local/database.dart';
import 'package:leardy/data/reminder_service.dart';
import 'package:leardy/data/remote/api_client.dart';
import 'package:leardy/data/sync_service.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/l10n/l10n.dart';

enum DeckFilter { all, due, newOnly, abc }

class ReminderSettings {
  const ReminderSettings({required this.enabled, required this.hour, required this.minute});

  final bool enabled;
  final int hour;
  final int minute;

  TimeOfDay get time => TimeOfDay(hour: hour, minute: minute);
}

final databaseProvider = Provider<LeardyDatabase>((ref) {
  final db = LeardyDatabase();
  ref.onDispose(db.close);
  return db;
});

final libraryProvider = Provider<LibraryStore>((ref) => LibraryStore(ref.watch(databaseProvider)));

final sessionStoreProvider = Provider<SessionStore>((ref) => SessionStore());

final syncServiceProvider = Provider<SyncService>((ref) => SyncService(ref.watch(libraryProvider)));

final themeModeProvider = StateNotifierProvider<ThemeModeController, ThemeMode>((ref) {
  return ThemeModeController(ref.watch(libraryProvider));
});

class ThemeModeController extends StateNotifier<ThemeMode> {
  ThemeModeController(this._library) : super(ThemeMode.system) {
    _load();
  }

  final LibraryStore _library;

  Future<void> _load() async {
    final value = await _library.setting('theme', 'system');
    state = switch (value) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    final value = switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    };
    await _library.setSetting('theme', value);
  }
}

final localeProvider = StateNotifierProvider<LocaleController, Locale>((ref) {
  return LocaleController(ref.watch(libraryProvider));
});

class LocaleController extends StateNotifier<Locale> {
  LocaleController(this._library) : super(const Locale('hu')) {
    _load();
  }

  final LibraryStore _library;

  Future<void> _load() async {
    final value = await _library.setting('locale', 'hu');
    if (L10nLang.all.any((item) => item.code == value)) {
      state = Locale(value);
    }
  }

  Future<void> setLocale(Locale locale) async {
    state = locale;
    await _library.setSetting('locale', locale.languageCode);
  }
}

final apiBaseProvider = StateNotifierProvider<ApiBaseController, String>((ref) {
  return ApiBaseController(ref.watch(libraryProvider));
});

class ApiBaseController extends StateNotifier<String> {
  ApiBaseController(this._library) : super(defaultApiBase()) {
    _load();
  }

  final LibraryStore _library;

  Future<void> _load() async {
    const defined = String.fromEnvironment('API_BASE');
    if (defined.isNotEmpty) {
      state = defined;
      await _library.setSetting('apiBase', defined);
      return;
    }
    final value = await _library.setting('apiBase');
    if (value.isNotEmpty) state = value;
  }

  Future<void> setUrl(String url) async {
    state = url.trim().replaceAll(RegExp(r'/+$'), '');
    await _library.setSetting('apiBase', state);
  }
}

final deckFilterProvider = StateNotifierProvider<DeckFilterController, DeckFilter>((ref) {
  return DeckFilterController(ref.watch(libraryProvider));
});

class DeckFilterController extends StateNotifier<DeckFilter> {
  DeckFilterController(this._library) : super(DeckFilter.all) {
    _load();
  }

  final LibraryStore _library;

  Future<void> _load() async {
    final value = await _library.setting('deckFilter', 'all');
    state = DeckFilter.values.firstWhere((item) => item.name == value, orElse: () => DeckFilter.all);
  }

  Future<void> setFilter(DeckFilter filter) async {
    state = filter;
    await _library.setSetting('deckFilter', filter.name);
  }
}

final reminderProvider = StateNotifierProvider<ReminderController, ReminderSettings>((ref) {
  return ReminderController(ref.watch(libraryProvider));
});

class ReminderController extends StateNotifier<ReminderSettings> {
  ReminderController(this._library) : super(const ReminderSettings(enabled: false, hour: 18, minute: 0)) {
    _load();
  }

  final LibraryStore _library;

  Future<void> _load() async {
    final enabled = await _library.setting('reminderEnabled', 'false');
    final time = await _library.setting('reminderTime', '18:00');
    final parts = time.split(':');
    state = ReminderSettings(
      enabled: enabled == 'true',
      hour: int.tryParse(parts.first) ?? 18,
      minute: int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0,
    );
    await _reschedule();
  }

  Future<String> _locale() async {
    final value = await _library.setting('locale', 'hu');
    return value.isEmpty ? 'hu' : value;
  }

  Future<void> _reschedule() async {
    try {
      if (!state.enabled) {
        await ReminderService.instance.cancel();
        return;
      }
      await ReminderService.instance.scheduleDaily(
        hour: state.hour,
        minute: state.minute,
        locale: await _locale(),
      );
    } catch (_) {}
  }

  Future<void> setEnabled(bool enabled) async {
    state = ReminderSettings(enabled: enabled, hour: state.hour, minute: state.minute);
    await _library.setSetting('reminderEnabled', enabled ? 'true' : 'false');
    if (enabled) {
      try {
        await ReminderService.instance.requestPermission();
      } catch (_) {}
    }
    await _reschedule();
  }

  Future<void> setTime(TimeOfDay time) async {
    state = ReminderSettings(enabled: state.enabled, hour: time.hour, minute: time.minute);
    final hh = time.hour.toString().padLeft(2, '0');
    final mm = time.minute.toString().padLeft(2, '0');
    await _library.setSetting('reminderTime', '$hh:$mm');
    await _reschedule();
  }
}

final dailyGoalProvider = StateNotifierProvider<GoalController, int>((ref) {
  return GoalController(ref.watch(libraryProvider));
});

class GoalController extends StateNotifier<int> {
  GoalController(this._library) : super(20) {
    _load();
  }

  final LibraryStore _library;

  Future<void> _load() async {
    final value = await _library.setting('dailyGoal', '20');
    state = int.tryParse(value) ?? 20;
  }

  Future<void> setGoal(int goal) async {
    state = goal;
    await _library.setSetting('dailyGoal', '$goal');
  }
}

class CardsQuery {
  const CardsQuery({this.subjectId, this.classId, this.kind});

  final String? subjectId;
  final String? classId;
  final String? kind;

  bool get hasFilters => subjectId != null || classId != null || kind != null;

  CardsQuery copyWith({
    String? subjectId,
    String? classId,
    String? kind,
    bool clearSubject = false,
    bool clearClass = false,
    bool clearKind = false,
  }) {
    return CardsQuery(
      subjectId: clearSubject ? null : (subjectId ?? this.subjectId),
      classId: clearClass ? null : (classId ?? this.classId),
      kind: clearKind ? null : (kind ?? this.kind),
    );
  }
}

final cardsQueryProvider = StateProvider<CardsQuery>((ref) => const CardsQuery());

final selectedSubjectProvider = StateProvider<String?>((ref) => null);

final subjectsProvider = StreamProvider<List<SubjectView>>((ref) {
  return ref.watch(libraryProvider).watchSubjects();
});

final decksProvider = StreamProvider.family<List<DeckView>, String>((ref, subjectId) {
  return ref.watch(libraryProvider).watchDecks(subjectId);
});

final allDecksProvider = StreamProvider<List<DeckView>>((ref) {
  return ref.watch(libraryProvider).watchAllDecks();
});

final homeProvider = StreamProvider<HomeSnapshot>((ref) {
  return ref.watch(libraryProvider).watchHome();
});

class AuthState {
  const AuthState({this.user, this.token, this.ready = false});
  final AuthUser? user;
  final String? token;
  final bool ready;
  bool get isAuthenticated => user != null && token != null;
}

final authProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  final controller = AuthController(ref.read(sessionStoreProvider), ref.read(libraryProvider));
  ref.listen<String>(apiBaseProvider, (_, next) => controller.updateBase(next));
  return controller;
});

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._store, this._library) : super(const AuthState()) {
    _init();
  }

  final SessionStore _store;
  final LibraryStore _library;
  String _base = defaultApiBase();

  Future<void> _init() async {
    const defined = String.fromEnvironment('API_BASE');
    final saved = await _library.setting('apiBase');
    if (defined.isNotEmpty) {
      _base = defined;
      if (saved != defined) await _library.setSetting('apiBase', defined);
    } else if (saved.isNotEmpty) {
      _base = saved;
    }
    final token = await _store.token();
    final user = await _store.user();
    if (token == null || user == null) {
      state = const AuthState(ready: true);
      return;
    }
    final local = AuthUser(id: user.id, username: user.username, email: user.email, isTeacher: user.isTeacher);
    try {
      final remote = await ApiClient(baseUrl: _base, token: token).me().timeout(const Duration(seconds: 8));
      await _persist(token, remote);
    } on UnauthorizedException {
      await _store.clear();
      state = const AuthState(ready: true);
    } catch (_) {
      state = AuthState(token: token, user: local, ready: true);
    }
  }

  void updateBase(String url) {
    if (url.isEmpty) return;
    _base = url;
  }

  ApiClient get client => ApiClient(
        baseUrl: _base,
        token: state.token,
        onUnauthorized: _clearLocal,
      );

  void _clearLocal() {
    if (!state.isAuthenticated) return;
    _store.clear();
    state = const AuthState(ready: true);
  }

  Future<void> register({required String name, required String email, required String password}) async {
    final trimmedName = name.trim();
    final trimmedEmail = email.trim().toLowerCase();
    if (!RegExp(r"^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,63}$", unicode: true).hasMatch(trimmedName)) {
      throw ApiException('Name must be 2-64 characters');
    }
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(trimmedEmail)) {
      throw ApiException('Invalid email');
    }
    if (password.length < 8) throw ApiException('Password must be at least 8 characters');
    if (password.length > 128) throw ApiException('Password is too long');
    final result = await ApiClient(baseUrl: _base).register(name: trimmedName, email: trimmedEmail, password: password);
    await _persist(result.token, result.user);
  }

  Future<void> login({required String email, required String password}) async {
    final trimmedEmail = email.trim().toLowerCase();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(trimmedEmail)) {
      throw ApiException('Invalid email');
    }
    if (password.length < 8) throw ApiException('Password must be at least 8 characters');
    if (password.length > 128) throw ApiException('Password is too long');
    final result = await ApiClient(baseUrl: _base).login(email: trimmedEmail, password: password);
    await _persist(result.token, result.user);
  }

  Future<void> saveProfile({
    String? name,
    String? email,
    String? currentPassword,
    String? newPassword,
    bool? isTeacher,
  }) async {
    if (name != null) {
      final trimmed = name.trim();
      if (!RegExp(r"^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,63}$", unicode: true).hasMatch(trimmed)) {
        throw ApiException('Name must be 2-64 characters');
      }
    }
    if (email != null && email.trim().isNotEmpty) {
      if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email.trim())) {
        throw ApiException('Invalid email');
      }
    }
    if (newPassword != null && newPassword.isNotEmpty && newPassword.length < 8) {
      throw ApiException('Password must be at least 8 characters');
    }
    if (newPassword != null && newPassword.length > 128) {
      throw ApiException('Password is too long');
    }
    final user = await client.patchMe(
      name: name,
      email: email,
      currentPassword: currentPassword,
      newPassword: newPassword,
      isTeacher: isTeacher,
    );
    if (state.token == null) return;
    await _persist(state.token!, user);
  }

  Future<void> logout() async {
    try {
      if (state.token != null) await client.logout();
    } catch (_) {}
    await _store.clear();
    state = const AuthState(ready: true);
  }

  Future<void> _persist(String token, AuthUser user) async {
    await _store.save(token: token, id: user.id, username: user.username, email: user.email, isTeacher: user.isTeacher);
    state = AuthState(token: token, user: user, ready: true);
  }
}

enum LibraryTab { mine, discover }

final libraryTabProvider = StateProvider<LibraryTab>((ref) => LibraryTab.mine);

final librarySearchProvider = StateProvider<String>((ref) => '');

final libraryUserIdProvider = Provider<String>((ref) {
  return ref.watch(authProvider).user?.id ?? 'local';
});

final accountTeacherProvider = Provider<bool>((ref) {
  return ref.watch(authProvider).user?.isTeacher == true;
});

final savedBundlesProvider = StreamProvider<List<BundleView>>((ref) {
  final userId = ref.watch(libraryUserIdProvider);
  return ref.watch(libraryProvider).watchSavedBundles(userId);
});

final publicBundlesProvider = StreamProvider<List<BundleView>>((ref) {
  final userId = ref.watch(libraryUserIdProvider);
  return ref.watch(libraryProvider).watchPublicBundles(userId);
});

final classroomsProvider = FutureProvider<List<Classroom>>((ref) async {
  if (!ref.watch(authProvider).isAuthenticated) return const [];
  try {
    return await ref.read(authProvider.notifier).client.classes();
  } on ApiException {
    return const [];
  }
});

final classAssignedIdsProvider = FutureProvider.family<Set<String>, String>((ref, classId) async {
  final userId = ref.watch(libraryUserIdProvider);
  final bundles = await ref.read(libraryProvider).classBundles(classId, userId);
  return {for (final bundle in bundles) bundle.id};
});

final bundleProvider = StreamProvider.family<BundleView?, String>((ref, bundleId) {
  final userId = ref.watch(libraryUserIdProvider);
  return ref.watch(libraryProvider).watchBundle(bundleId, userId);
});
