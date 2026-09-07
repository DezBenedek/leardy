import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/features/settings/sheets.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final theme = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);
    final reminder = ref.watch(reminderProvider);
    final ink = context.ink;
    final l10n = L10n.of(context);
    final themeLabel = switch (theme) {
      ThemeMode.light => l10n.themeLight,
      ThemeMode.dark => l10n.themeDark,
      ThemeMode.system => l10n.themeSystem,
    };
    final languageLabel = L10nLang.all.firstWhere((item) => item.code == locale.languageCode, orElse: () => L10nLang.all.first).label;
    final reminderLabel = reminder.enabled ? reminder.time.format(context) : l10n.reminderOff;
    final goal = ref.watch(dailyGoalProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        AppCard(
          onTap: () => showAccountSheet(context, ref),
          child: Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: ink.margin.withValues(alpha: 0.14),
                child: Icon(
                  auth.isAuthenticated ? Icons.person_rounded : Icons.person_outline_rounded,
                  color: ink.margin,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      auth.isAuthenticated ? auth.user!.username : l10n.guest,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      auth.isAuthenticated ? (auth.user!.email ?? l10n.noEmail) : l10n.loginForClassroom,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: ink.inkMuted),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
        const SizedBox(height: 20),
        SettingsGroup(
          title: l10n.settingsApp,
          children: [
            ListTile(
              leading: const Icon(Icons.palette_outlined),
              title: Text(l10n.appearance),
              subtitle: Text(themeLabel),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => showThemeSheet(context, ref),
            ),
            ListTile(
              leading: const Icon(Icons.language_rounded),
              title: Text(l10n.language),
              subtitle: Text(languageLabel),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => showLanguageSheet(context, ref),
            ),
            ListTile(
              leading: const Icon(Icons.notifications_outlined),
              title: Text(l10n.reminders),
              subtitle: Text(reminderLabel),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => showRemindersSheet(context, ref),
            ),
            ListTile(
              leading: const Icon(Icons.track_changes_outlined),
              title: Text(l10n.dailyGoal),
              subtitle: Text(l10n.cardsPerDay(goal)),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => showGoalSheet(context, ref),
            ),
          ],
        ),
        const SizedBox(height: 20),
        SettingsGroup(
          title: l10n.settingsAccount,
          children: [
            ListTile(
              leading: const Icon(Icons.manage_accounts_outlined),
              title: Text(auth.isAuthenticated ? l10n.manageAccount : l10n.loginOrRegister),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => showAccountSheet(context, ref),
            ),
            ListTile(
              leading: const Icon(Icons.cloud_outlined),
              title: Text(l10n.sync),
              subtitle: Text(auth.isAuthenticated ? l10n.syncLoggedIn : l10n.syncNeedAccount),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => showSyncSheet(context, ref),
            ),
          ],
        ),
        const SizedBox(height: 20),
        SettingsGroup(
          title: l10n.about,
          children: [
            ListTile(
              leading: const Icon(Icons.info_outline_rounded),
              title: Text(l10n.appName),
              subtitle: Text(l10n.aboutTagline),
              onTap: () => showAppSheet(
                context: context,
                title: l10n.about,
                expand: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.aboutTagline,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(l10n.aboutBody),
                    const SizedBox(height: 16),
                    Text(
                      l10n.aboutFeatures,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    for (final feature in [
                      l10n.aboutF1,
                      l10n.aboutF2,
                      l10n.aboutF3,
                      l10n.aboutF4,
                      l10n.aboutF5,
                    ])
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Padding(
                              padding: EdgeInsets.only(top: 2),
                              child: Icon(Icons.check_rounded, size: 18),
                            ),
                            const SizedBox(width: 8),
                            Expanded(child: Text(feature)),
                          ],
                        ),
                      ),
                    const SizedBox(height: 12),
                    Text(
                      l10n.aboutVersion,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: context.ink.inkMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
