import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/design_system/theme/type.dart';

class ZsoKartya extends StatefulWidget {
  const ZsoKartya({
    super.key,
    required this.front,
    required this.back,
    required this.stamp,
    this.frontHint,
    this.backHint,
    this.canFlip = true,
    this.onFlipped,
    this.onKnow,
    this.onDontKnow,
    this.knowLabel,
    this.dontKnowLabel,
  });

  final String front;
  final String back;
  final String stamp;
  final String? frontHint;
  final String? backHint;
  final bool canFlip;
  final ValueChanged<bool>? onFlipped;
  final VoidCallback? onKnow;
  final VoidCallback? onDontKnow;
  final String? knowLabel;
  final String? dontKnowLabel;

  @override
  State<ZsoKartya> createState() => _ZsoKartyaState();
}

class _ZsoKartyaState extends State<ZsoKartya> with TickerProviderStateMixin {
  late final AnimationController _flip = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 200),
  );
  late final AnimationController _slide = AnimationController(vsync: this);

  bool get _canSwipe => widget.onKnow != null || widget.onDontKnow != null;
  bool _showBack = false;
  bool _dragging = false;
  bool _locked = false;
  double _drag = 0;
  double _slideFrom = 0;
  double _slideTo = 0;

  @override
  void initState() {
    super.initState();
    _slide.addListener(_onSlideTick);
  }

  @override
  void dispose() {
    _slide.removeListener(_onSlideTick);
    _flip.dispose();
    _slide.dispose();
    super.dispose();
  }

  void _onSlideTick() {
    if (!mounted) return;
    setState(() {
      _drag = lerpDouble(_slideFrom, _slideTo, _slide.value) ?? _slideTo;
    });
  }

  void _commit(bool toBack) {
    if (!widget.canFlip || _locked || _dragging) return;
    _showBack = toBack;
    widget.onFlipped?.call(toBack);
    HapticFeedback.selectionClick();
    if (toBack) {
      _flip.forward();
    } else {
      _flip.reverse();
    }
  }

  void _onDragStart(DragStartDetails _) {
    if (_locked) return;
    _slide.stop();
    setState(() => _dragging = true);
  }

  void _onDragUpdate(DragUpdateDetails details) {
    if (_locked) return;
    setState(() => _drag += details.delta.dx);
  }

  Future<void> _onDragEnd(DragEndDetails details) async {
    if (_locked || !mounted) return;
    final width = MediaQuery.sizeOf(context).width;
    final velocity = details.velocity.pixelsPerSecond.dx;
    final threshold = width * 0.2;
    final goRight = widget.onKnow != null && (_drag > threshold || (velocity > 850 && _drag > 20));
    final goLeft = widget.onDontKnow != null && (_drag < -threshold || (velocity < -850 && _drag < -20));

    if (goRight || goLeft) {
      _locked = true;
      HapticFeedback.mediumImpact();
      await _animateDragTo((goRight ? 1 : -1) * (width + 120), const Duration(milliseconds: 220), Curves.easeInCubic);
      if (!mounted) return;
      if (goRight) {
        widget.onKnow!();
      } else {
        widget.onDontKnow!();
      }
      return;
    }

    final distance = _drag.abs();
    final ms = (160 + distance * 0.28).clamp(160, 280).round();
    await _animateDragTo(0, Duration(milliseconds: ms), Curves.easeOutCubic);
    if (mounted) setState(() => _dragging = false);
  }

  void _onDragCancel() {
    if (_locked) return;
    _animateDragTo(0, const Duration(milliseconds: 200), Curves.easeOutCubic).then((_) {
      if (mounted) setState(() => _dragging = false);
    });
  }

  Future<void> _animateDragTo(double target, Duration duration, Curve curve) {
    _slide.stop();
    _slideFrom = _drag;
    _slideTo = target;
    _slide.duration = duration;
    _slide.value = 0;
    return _slide.animateTo(1, curve: curve);
  }

  @override
  Widget build(BuildContext context) {
    final ink = context.ink;
    final progress = (_drag / 90).clamp(-1.0, 1.0);
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = constraints.maxHeight.isFinite ? constraints.maxHeight : math.min(width * 0.72, 340.0);
        return GestureDetector(
          onTap: (_dragging || _locked) ? null : () => _commit(!_showBack),
          onHorizontalDragStart: _canSwipe ? _onDragStart : null,
          onHorizontalDragUpdate: _canSwipe ? _onDragUpdate : null,
          onHorizontalDragEnd: _canSwipe ? (details) => _onDragEnd(details) : null,
          onHorizontalDragCancel: _canSwipe ? _onDragCancel : null,
          child: AnimatedBuilder(
            animation: _flip,
            builder: (context, _) {
              final t = Curves.easeOutCubic.transform(_flip.value);
              final angle = t * math.pi;
              final showBack = t > 0.5;
              return Transform.translate(
                offset: Offset(_drag, 0),
                child: Transform.rotate(
                  angle: _drag * 0.0007,
                  child: Stack(
                    children: [
                      Transform(
                        alignment: Alignment.center,
                        transform: Matrix4.identity()
                          ..setEntry(3, 2, 0.0012)
                          ..rotateY(angle),
                        child: Transform(
                          alignment: Alignment.center,
                          transform: Matrix4.identity()..rotateY(showBack ? math.pi : 0),
                          child: Card(
                            clipBehavior: Clip.antiAlias,
                            child: SizedBox(
                              height: height,
                              width: double.infinity,
                              child: DefaultTextStyle(
                                style: LeardyType.ui(
                                  size: 28,
                                  weight: FontWeight.w700,
                                  color: ink.ink,
                                  height: 1.2,
                                  letterSpacing: -0.4,
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(22, 18, 22, 18),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.stretch,
                                    children: [
                                      Text(
                                        widget.stamp,
                                        style: LeardyType.ui(size: 12, weight: FontWeight.w600, color: ink.inkMuted),
                                      ),
                                      Expanded(
                                        child: Center(
                                          child: FittedBox(
                                            fit: BoxFit.scaleDown,
                                            child: ConstrainedBox(
                                              constraints: BoxConstraints(maxWidth: width - 44),
                                              child: Text(
                                                showBack ? widget.back : widget.front,
                                                textAlign: TextAlign.center,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                      Text(
                                        widget.canFlip
                                            ? (showBack ? (widget.backHint ?? '') : (widget.frontHint ?? ''))
                                            : '',
                                        textAlign: TextAlign.center,
                                        style: LeardyType.ui(size: 12, weight: FontWeight.w500, color: ink.graphite),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      if (progress.abs() > 0.12)
                        Positioned.fill(
                          child: IgnorePointer(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: (progress > 0 ? ink.forest : ink.wine).withValues(alpha: progress.abs() * 0.22),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const SizedBox.expand(),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}
