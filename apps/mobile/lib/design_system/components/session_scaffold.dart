import 'package:flutter/material.dart';

/// Full-screen study/practice chrome that stays below the status bar.
class SessionScaffold extends StatelessWidget {
  const SessionScaffold({
    super.key,
    required this.body,
    this.progress,
    this.trailing = const [],
    this.onBack,
  });

  final Widget body;
  final double? progress;
  final List<Widget> trailing;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.viewPaddingOf(context).top;
    return Scaffold(
      body: Padding(
        padding: EdgeInsets.only(top: top),
        child: Column(
          children: [
            if (progress != null)
              LinearProgressIndicator(value: progress, minHeight: 3),
            Row(
              children: [
                IconButton(
                  tooltip: MaterialLocalizations.of(
                    context,
                  ).backButtonTooltip,
                  onPressed:
                      onBack ?? () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.arrow_back_rounded),
                ),
                const Spacer(),
                ...trailing,
              ],
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}
