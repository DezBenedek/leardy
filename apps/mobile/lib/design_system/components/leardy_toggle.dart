import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';

class LeardyToggle extends StatelessWidget {
  const LeardyToggle({super.key, required this.value, required this.onChanged});

  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final ink = context.ink;
    final enabled = onChanged != null;
    return Semantics(
      toggled: value,
      enabled: enabled,
      button: true,
      child: GestureDetector(
        onTap: enabled
            ? () {
                HapticFeedback.selectionClick();
                onChanged!(!value);
              }
            : null,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 160),
          opacity: enabled ? 1 : 0.45,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOutCubic,
            width: 58,
            height: 36,
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: value ? ink.margin : ink.paperSunken,
              borderRadius: BorderRadius.circular(99),
              border: Border.all(color: value ? ink.margin : ink.graphite, width: 2),
            ),
            alignment: value ? Alignment.centerRight : Alignment.centerLeft,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: value ? Colors.white : ink.graphite,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.12),
                    blurRadius: 4,
                    offset: const Offset(0, 1),
                  ),
                ],
              ),
              child: const SizedBox(width: 26, height: 26),
            ),
          ),
        ),
      ),
    );
  }
}

class LeardyToggleTile extends StatelessWidget {
  const LeardyToggleTile({
    super.key,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(title),
      subtitle: subtitle == null ? null : Text(subtitle!),
      trailing: LeardyToggle(value: value, onChanged: onChanged),
      onTap: onChanged == null ? null : () => onChanged!(!value),
    );
  }
}
