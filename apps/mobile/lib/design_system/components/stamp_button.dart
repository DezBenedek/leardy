import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:leardy/design_system/theme/type.dart';

class StampButton extends StatefulWidget {
  const StampButton({
    super.key,
    required this.label,
    required this.color,
    required this.onPressed,
  });

  final String label;
  final Color color;
  final VoidCallback onPressed;

  @override
  State<StampButton> createState() => _StampButtonState();
}

class _StampButtonState extends State<StampButton> {
  double _scale = 1;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _scale = 0.92),
      onTapCancel: () => setState(() => _scale = 1),
      onTapUp: (_) {
        setState(() => _scale = 1);
        HapticFeedback.lightImpact();
        widget.onPressed();
      },
      child: AnimatedScale(
        scale: _scale,
        duration: const Duration(milliseconds: 90),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48, minWidth: 48),
          child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            border: Border.all(color: widget.color, width: 1.5),
          ),
          alignment: Alignment.center,
          child: Text(
            widget.label.toUpperCase(),
            style: LeardyType.bricolage(size: 12, color: widget.color, letterSpacing: 0.12),
          ),
        ),
        ),
      ),
    );
  }
}
