import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/features/classroom/quiz_invite.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class AdaptiveShell extends ConsumerWidget {
  const AdaptiveShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  List<NavigationDestination> _destinations(L10n l10n, bool showClassroom) {
    return [
      NavigationDestination(
        icon: const Icon(Icons.home_outlined),
        selectedIcon: const Icon(Icons.home_rounded),
        label: l10n.tabToday,
      ),
      NavigationDestination(
        icon: const Icon(Icons.style_outlined),
        selectedIcon: const Icon(Icons.style_rounded),
        label: l10n.tabCards,
      ),
      if (showClassroom)
        NavigationDestination(
          icon: const Icon(Icons.groups_outlined),
          selectedIcon: const Icon(Icons.groups_rounded),
          label: l10n.tabClassroom,
        ),
      NavigationDestination(
        icon: const Icon(Icons.settings_outlined),
        selectedIcon: const Icon(Icons.settings_rounded),
        label: l10n.tabSettings,
      ),
    ];
  }

  int _index(bool showClassroom) {
    final branch = navigationShell.currentIndex;
    if (!showClassroom && branch >= 3) return 2;
    if (!showClassroom && branch == 2) return 0;
    return branch.clamp(0, showClassroom ? 3 : 2);
  }

  void _go(int visualIndex, WidgetRef ref, bool showClassroom) {
    final branch = !showClassroom && visualIndex >= 2
        ? visualIndex + 1
        : visualIndex;
    if (branch == 1 && navigationShell.currentIndex != 1) {
      ref.read(cardsQueryProvider.notifier).state = const CardsQuery();
    }
    navigationShell.goBranch(
      branch,
      initialLocation: visualIndex == _index(showClassroom),
    );
  }

  String _title(L10n l10n, bool showClassroom) {
    return switch (navigationShell.currentIndex) {
      1 => l10n.tabCards,
      2 => showClassroom ? l10n.tabClassroom : l10n.tabSettings,
      3 => l10n.tabSettings,
      _ => l10n.appName,
    };
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final auth = ref.watch(authProvider);
    final showClassroom = auth.isAuthenticated;
    final dests = _destinations(l10n, showClassroom);
    final index = _index(showClassroom).clamp(0, dests.length - 1);
    final wide = MediaQuery.sizeOf(context).shortestSide >= 600;
    final body = navigationShell;

    if (wide) {
      return QuizInviteHost(
        child: Scaffold(
          resizeToAvoidBottomInset: true,
          body: Row(
            children: [
              SizedBox(
                width: 212,
                child: SafeArea(
                  child: NavigationDrawer(
                    selectedIndex: index,
                    onDestinationSelected: (value) =>
                        _go(value, ref, showClassroom),
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 12, 12, 8),
                        child: Text(
                          l10n.appName,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      NavigationDrawerDestination(
                        icon: const Icon(Icons.home_outlined),
                        label: Text(l10n.homeTab),
                      ),
                      NavigationDrawerDestination(
                        icon: const Icon(Icons.style_outlined),
                        label: Text(l10n.tabCards),
                      ),
                      if (showClassroom)
                        NavigationDrawerDestination(
                          icon: const Icon(Icons.groups_outlined),
                          label: Text(l10n.tabClassroom),
                        ),
                      NavigationDrawerDestination(
                        icon: const Icon(Icons.settings_outlined),
                        label: Text(l10n.tabSettings),
                      ),
                    ],
                  ),
                ),
              ),
              const VerticalDivider(width: 1),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    top: MediaQuery.viewPaddingOf(context).top,
                  ),
                  child: body,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return QuizInviteHost(
      child: Scaffold(
        resizeToAvoidBottomInset: true,
        appBar: navigationShell.currentIndex == 1
            ? null
            : AppBar(
                automaticallyImplyLeading: false,
                title: Text(_title(l10n, showClassroom)),
              ),
        body: Padding(
          padding: EdgeInsets.only(
            top: navigationShell.currentIndex == 1
                ? MediaQuery.viewPaddingOf(context).top
                : 0,
          ),
          child: body,
        ),
        bottomNavigationBar: NavigationBar(
          key: ValueKey('nav-$showClassroom'),
          selectedIndex: index,
          destinations: dests,
          onDestinationSelected: (value) => _go(value, ref, showClassroom),
        ),
      ),
    );
  }
}
