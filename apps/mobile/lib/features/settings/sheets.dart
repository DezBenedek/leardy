import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:leardy/data/remote/api_client.dart';
import 'package:leardy/design_system/components/leardy_toggle.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/toast.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

Future<void> showThemeSheet(BuildContext context, WidgetRef ref) {
  final l10n = L10n.of(context);
  return showAppSheet(
    context: context,
    title: l10n.appearance,
    subtitle: l10n.appearanceSubtitle,
    child: Consumer(
      builder: (context, _, _) {
        final current = ref.watch(themeModeProvider);
        return Column(
          children: [
            for (final item in [
              (ThemeMode.system, l10n.themeSystem, Icons.phone_iphone_rounded),
              (ThemeMode.light, l10n.themeLight, Icons.light_mode_outlined),
              (ThemeMode.dark, l10n.themeDark, Icons.dark_mode_outlined),
            ])
              ListTile(
                leading: Icon(item.$3),
                title: Text(item.$2),
                trailing: current == item.$1 ? Icon(Icons.check_rounded, color: Theme.of(context).colorScheme.primary) : null,
                onTap: () {
                  popAppSheet(context);
                  afterSheetClosed(() => ref.read(themeModeProvider.notifier).setMode(item.$1));
                },
              ),
          ],
        );
      },
    ),
  );
}

Future<void> showLanguageSheet(BuildContext context, WidgetRef ref) {
  final l10n = L10n.of(context);
  return showAppSheet(
    context: context,
    title: l10n.language,
    subtitle: l10n.languageSubtitle,
    child: Consumer(
      builder: (context, _, _) {
        final current = ref.watch(localeProvider).languageCode;
        return Column(
          children: [
            for (final lang in L10nLang.all)
              ListTile(
                leading: const Icon(Icons.translate_rounded),
                title: Text(lang.label),
                trailing: current == lang.code ? Icon(Icons.check_rounded, color: Theme.of(context).colorScheme.primary) : null,
                onTap: () {
                  popAppSheet(context);
                  afterSheetClosed(() => ref.read(localeProvider.notifier).setLocale(Locale(lang.code)));
                },
              ),
          ],
        );
      },
    ),
  );
}

Future<void> showRemindersSheet(BuildContext context, WidgetRef ref) {
  return showAppSheet(
    context: context,
    title: L10n.of(context).reminders,
    subtitle: L10n.of(context).remindersSubtitle,
    child: const _RemindersForm(),
  );
}

class _RemindersForm extends ConsumerWidget {
  const _RemindersForm();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final reminder = ref.watch(reminderProvider);
    final time = reminder.time.format(context);
    return Column(
      children: [
        LeardyToggleTile(
          title: l10n.reminderOn,
          subtitle: reminder.enabled ? l10n.reminderTime : l10n.reminderOff,
          value: reminder.enabled,
          onChanged: (value) => ref.read(reminderProvider.notifier).setEnabled(value),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.schedule_rounded),
          title: Text(l10n.reminderTime),
          subtitle: Text(time),
          enabled: reminder.enabled,
          onTap: () async {
            final picked = await showTimePicker(context: context, initialTime: reminder.time);
            if (picked != null) await ref.read(reminderProvider.notifier).setTime(picked);
          },
        ),
      ],
    );
  }
}

const _goalPresets = [5, 10, 20, 30, 50, 100];

Future<void> showGoalSheet(BuildContext context, WidgetRef ref) {
  final l10n = L10n.of(context);
  return showAppSheet(
    context: context,
    title: l10n.dailyGoal,
    child: Consumer(
      builder: (context, _, _) {
        final current = ref.watch(dailyGoalProvider);
        return Column(
          children: [
            for (final value in _goalPresets)
              ListTile(
                leading: const Icon(Icons.track_changes_outlined),
                title: Text(l10n.cardsPerDay(value)),
                trailing: current == value
                    ? Icon(
                        Icons.check_rounded,
                        color: Theme.of(context).colorScheme.primary,
                      )
                    : null,
                onTap: () {
                  popAppSheet(context);
                  afterSheetClosed(
                    () => ref.read(dailyGoalProvider.notifier).setGoal(value),
                  );
                },
              ),
          ],
        );
      },
    ),
  );
}

Future<void> showSyncSheet(BuildContext context, WidgetRef ref) {
  return showAppSheet(
    context: context,
    title: L10n.of(context).sync,
    child: const _SyncForm(),
  );
}

class _SyncForm extends ConsumerStatefulWidget {
  const _SyncForm();

  @override
  ConsumerState<_SyncForm> createState() => _SyncFormState();
}

class _SyncFormState extends ConsumerState<_SyncForm> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final auth = ref.watch(authProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(auth.isAuthenticated ? l10n.syncLoggedIn : l10n.syncNeedAccount),
        const SizedBox(height: 12),
        if (!auth.isAuthenticated)
          Text(l10n.syncLoginFirst)
        else
          FilledButton(
            onPressed: _busy
                ? null
                : () async {
                    setState(() => _busy = true);
                    try {
                      await ref.read(syncServiceProvider).sync(ref.read(authProvider.notifier).client);
                      if (mounted) showAppToast(context, l10n.syncOk);
                    } on ApiException catch (error) {
                      if (mounted) showAppToast(context, l10n.apiError(error.message));
                    } catch (error) {
                      if (mounted) showAppToast(context, '$error');
                    } finally {
                      if (mounted) setState(() => _busy = false);
                    }
                  },
            child: Text(l10n.syncNow),
          ),
      ],
    );
  }
}

Future<void> showAccountSheet(BuildContext context, WidgetRef ref) {
  final l10n = L10n.of(context);
  return showAppSheet(
    context: context,
    title: l10n.account,
    subtitle: l10n.accountSubtitle,
    child: const _AccountForm(),
  );
}

class _AccountForm extends ConsumerStatefulWidget {
  const _AccountForm();

  @override
  ConsumerState<_AccountForm> createState() => _AccountFormState();
}

class _AccountFormState extends ConsumerState<_AccountForm> {
  final _name = TextEditingController();
  final _password = TextEditingController();
  final _email = TextEditingController();
  bool _busy = false;
  bool _register = false;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    if (user != null) {
      _name.text = user.username;
      if (user.email != null) _email.text = user.email!;
    }
  }

  @override
  void dispose() {
    disposeAfterSheet([_name, _password, _email]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final auth = ref.watch(authProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!auth.isAuthenticated) ...[
          SegmentedButton<bool>(
            segments: [
              ButtonSegment(value: false, label: Text(l10n.login)),
              ButtonSegment(value: true, label: Text(l10n.register)),
            ],
            selected: {_register},
            onSelectionChanged: (value) => setState(() => _register = value.first),
          ),
          const SizedBox(height: 16),
          if (_register) ...[
            TextField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(labelText: l10n.name),
            ),
            const SizedBox(height: 10),
          ],
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(labelText: l10n.email),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _password,
            obscureText: true,
            autofillHints: _register ? const [AutofillHints.newPassword] : const [AutofillHints.password],
            decoration: InputDecoration(labelText: l10n.password),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy
                ? null
                : () => _run(() {
                      if (_register) {
                        return ref.read(authProvider.notifier).register(
                              name: _name.text,
                              email: _email.text,
                              password: _password.text,
                            );
                      }
                      return ref.read(authProvider.notifier).login(email: _email.text, password: _password.text);
                    }),
            child: Text(_register ? l10n.register : l10n.login),
          ),
        ] else ...[
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(labelText: l10n.name),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(labelText: l10n.email),
          ),
          const SizedBox(height: 14),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.iAmTeacher),
            subtitle: Text(l10n.iAmTeacherHint),
            trailing: LeardyToggle(
              value: auth.user?.isTeacher == true,
              onChanged: _busy
                  ? null
                  : (value) => _run(() => ref.read(authProvider.notifier).saveProfile(isTeacher: value), pop: false, toast: true),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _busy
                ? null
                : () => _run(() async {
                      await ref.read(authProvider.notifier).saveProfile(
                            name: _name.text,
                            email: _email.text.trim(),
                          );
                    }, pop: false, toast: true),
            child: Text(l10n.saveProfile),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _busy
                ? null
                : () {
                    FocusManager.instance.primaryFocus?.unfocus();
                    showPasswordSheet(context, ref);
                  },
            child: Text(l10n.changePassword),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _busy ? null : () => _run(() => ref.read(authProvider.notifier).logout()),
            child: Text(l10n.logout),
          ),
        ],
      ],
    );
  }

  Future<void> _run(Future<void> Function() action, {bool pop = true, bool toast = false}) async {
    final l10n = L10n.of(context);
    setState(() => _busy = true);
    try {
      await action();
      FocusManager.instance.primaryFocus?.unfocus();
      if (mounted && toast) showAppToast(this.context, l10n.toastSaved);
      if (mounted && pop) popAppSheet(context);
    } on ApiException catch (error) {
      if (mounted) showAppToast(this.context, l10n.apiError(error.message));
    } catch (error) {
      if (mounted) showAppToast(this.context, '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

Future<void> showPasswordSheet(BuildContext context, WidgetRef ref) {
  return showAppSheet(
    context: context,
    title: L10n.of(context).changePassword,
    child: const _PasswordForm(),
  );
}

class _PasswordForm extends ConsumerStatefulWidget {
  const _PasswordForm();

  @override
  ConsumerState<_PasswordForm> createState() => _PasswordFormState();
}

class _PasswordFormState extends ConsumerState<_PasswordForm> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    disposeAfterSheet([_current, _next]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _current,
          obscureText: true,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(labelText: l10n.currentPassword),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _next,
          obscureText: true,
          decoration: InputDecoration(labelText: l10n.newPassword),
        ),
        const SizedBox(height: 14),
        FilledButton(
          onPressed: _busy
              ? null
              : () async {
                  setState(() => _busy = true);
                  try {
                    await ref.read(authProvider.notifier).saveProfile(
                          currentPassword: _current.text,
                          newPassword: _next.text,
                        );
                    if (!context.mounted) return;
                    _current.clear();
                    _next.clear();
                    FocusManager.instance.primaryFocus?.unfocus();
                    showAppToast(context, l10n.toastSaved);
                    popAppSheet(context);
                  } on ApiException catch (error) {
                    if (mounted) showAppToast(context, l10n.apiError(error.message));
                  } catch (error) {
                    if (mounted) showAppToast(context, '$error');
                  } finally {
                    if (mounted) setState(() => _busy = false);
                  }
                },
          child: Text(l10n.changePassword),
        ),
      ],
    );
  }
}
