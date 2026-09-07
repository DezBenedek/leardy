import 'package:flutter/material.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';

OverlayEntry? _activeToast;

Duration toastDurationFor(String message) {
  final extra = (message.trim().length / 28).ceil().clamp(1, 8);
  return Duration(milliseconds: 900 + extra * 450);
}

void showAppToast(BuildContext context, String message) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  _activeToast?.remove();
  _activeToast = null;
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (context) => _AppToast(
      message: message,
      hold: toastDurationFor(message),
      onGone: () {
        if (_activeToast == entry) {
          entry.remove();
          _activeToast = null;
        }
      },
    ),
  );
  _activeToast = entry;
  overlay.insert(entry);
}

class _AppToast extends StatefulWidget {
  const _AppToast({
    required this.message,
    required this.hold,
    required this.onGone,
  });

  final String message;
  final Duration hold;
  final VoidCallback onGone;

  @override
  State<_AppToast> createState() => _AppToastState();
}

class _AppToastState extends State<_AppToast>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 180),
    reverseDuration: const Duration(milliseconds: 160),
  );
  late final Animation<double> _fade = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOutCubic,
  );

  @override
  void initState() {
    super.initState();
    _controller.forward();
    Future<void>.delayed(widget.hold, () async {
      if (!mounted) return;
      await _controller.reverse();
      if (mounted) widget.onGone();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ink = context.ink;
    final top = MediaQuery.viewPaddingOf(context).top;
    return IgnorePointer(
      child: Align(
        alignment: Alignment.topCenter,
        child: Padding(
          padding: EdgeInsets.only(top: top + 10),
          child: FadeTransition(
            opacity: _fade,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, -0.18),
                end: Offset.zero,
              ).animate(_fade),
              child: Material(
                color: ink.ink,
                elevation: 2,
                borderRadius: BorderRadius.circular(99),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 9,
                  ),
                  child: Text(
                    widget.message,
                    style: Theme.of(
                      context,
                    ).textTheme.labelLarge?.copyWith(color: ink.paper),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
