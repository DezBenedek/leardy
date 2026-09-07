import 'package:flutter/material.dart';

/// Content-sized bottom sheet. Short children stay short; long lists may
/// grow up to most of the screen instead of leaving empty space.
Future<T?> showAppSheet<T>({
  required BuildContext context,
  required String title,
  String? subtitle,
  required Widget child,
  bool expand = false,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useRootNavigator: true,
    useSafeArea: false,
    showDragHandle: true,
    enableDrag: true,
    barrierColor: Colors.black.withValues(alpha: 0.45),
    constraints: const BoxConstraints(
      maxWidth: double.infinity,
      minWidth: double.infinity,
    ),
    builder: (context) => _AppSheetScaffold(
      title: title,
      subtitle: subtitle,
      expand: expand,
      child: child,
    ),
  );
}

class _AppSheetScaffold extends StatelessWidget {
  const _AppSheetScaffold({
    required this.title,
    required this.child,
    this.subtitle,
    this.expand = false,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final bottomInset = media.viewInsets.bottom;
    final usable = media.size.height - media.padding.top - bottomInset;
    final maxHeight = (usable * (expand ? 0.92 : 0.90)).clamp(
      160.0,
      media.size.height * 0.92,
    );
    final header = <Widget>[
      Text(title, style: Theme.of(context).textTheme.titleMedium),
      if (subtitle != null) ...[
        const SizedBox(height: 2),
        Text(
          subtitle!,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.64),
          ),
        ),
      ],
      const SizedBox(height: 8),
    ];
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.only(bottom: 4),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: maxHeight,
            minWidth: double.infinity,
          ),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            children: [...header, child],
          ),
        ),
      ),
    );
  }
}

Future<void> afterSheetClosed(VoidCallback action) async {
  await Future<void>.delayed(const Duration(milliseconds: 240));
  action();
}

void popAppSheet<T extends Object?>(BuildContext context, [T? result]) {
  for (final useRoot in [true, false]) {
    final navigator = Navigator.maybeOf(context, rootNavigator: useRoot);
    if (navigator == null) continue;
    Route<dynamic>? top;
    navigator.popUntil((route) {
      top ??= route;
      return true;
    });
    if (top is PopupRoute && navigator.canPop()) {
      navigator.pop(result);
      return;
    }
  }
}

void disposeAfterSheet(Iterable<TextEditingController> controllers) {
  FocusManager.instance.primaryFocus?.unfocus();
  final items = controllers.toList();
  Future<void>.delayed(const Duration(milliseconds: 320), () {
    for (final item in items) {
      item.dispose();
    }
  });
}

InputDecoration appMultilineDecoration(String label) {
  return InputDecoration(
    labelText: label,
    alignLabelWithHint: true,
    floatingLabelAlignment: FloatingLabelAlignment.start,
    floatingLabelBehavior: FloatingLabelBehavior.auto,
  );
}

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.onTap, this.padding});

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final card = Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: padding ?? const EdgeInsets.fromLTRB(12, 8, 12, 8),
        child: child,
      ),
    );
    if (onTap == null) return card;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: padding ?? const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: child,
        ),
      ),
    );
  }
}

class SettingsGroup extends StatelessWidget {
  const SettingsGroup({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Text(
            title.toUpperCase(),
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ),
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                children[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}
