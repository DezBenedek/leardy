import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:leardy/design_system/components/session_scaffold.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class MapPracticePage extends ConsumerStatefulWidget {
  const MapPracticePage({
    super.key,
    required this.bundleId,
    required this.activityId,
  });

  final String bundleId;
  final String activityId;

  @override
  ConsumerState<MapPracticePage> createState() => _MapPracticePageState();
}

class _MapPracticePageState extends ConsumerState<MapPracticePage> {
  List<MapHotspot> _hotspots = [];
  final _found = <String>{};
  final _typed = TextEditingController();
  MapHotspot? _target;
  String? _feedback;
  var _tapMode = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final items = await ref
        .read(libraryProvider)
        .hotspotsForActivity(widget.activityId);
    if (!mounted) return;
    setState(() {
      _hotspots = items;
      _pickNext();
    });
  }

  void _pickNext() {
    final remaining = _hotspots.where((h) => !_found.contains(h.name)).toList();
    remaining.shuffle();
    _target = remaining.isEmpty ? null : remaining.first;
    _feedback = null;
    _typed.clear();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final target = _target;
    final done = _hotspots.isNotEmpty && _found.length == _hotspots.length;
    return SessionScaffold(
      progress: _hotspots.isEmpty ? 0 : _found.length / _hotspots.length,
      trailing: [
        IconButton(
          tooltip: _tapMode ? l10n.typeThePlace : l10n.tapThePlace,
          onPressed: () => setState(() {
            _tapMode = !_tapMode;
            _feedback = null;
          }),
          icon: Icon(
            _tapMode ? Icons.touch_app_outlined : Icons.keyboard_alt_outlined,
          ),
        ),
      ],
      body: SafeArea(
        child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              done
                  ? l10n.lessonDone
                  : (target == null
                        ? l10n.mapPractice
                        : (_tapMode
                              ? '${l10n.tapThePlace}: ${target.name}'
                              : l10n.typeThePlace)),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              '${_found.length} / ${_hotspots.length}',
              style: Theme.of(context).textTheme.labelSmall,
            ),
            const SizedBox(height: 12),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return GestureDetector(
                    onTapDown: _tapMode && !done
                        ? (details) =>
                              _tap(details.localPosition, constraints.biggest)
                        : null,
                    child: CustomPaint(
                      painter: _MapPainter(
                        hotspots: _hotspots,
                        found: _found,
                        ink: context.ink.margin,
                        muted: context.ink.inkMuted,
                      ),
                      child: const SizedBox.expand(),
                    ),
                  );
                },
              ),
            ),
            if (!_tapMode && !done) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _typed,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submitName(),
                decoration: InputDecoration(labelText: l10n.typeThePlace),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _submitName,
                child: Text(l10n.submitAnswer),
              ),
            ],
            if (_feedback != null) ...[
              const SizedBox(height: 8),
              Text(_feedback!, textAlign: TextAlign.center),
            ],
          ],
        ),
      ),
      ),
    );
  }

  void _tap(Offset local, Size size) {
    final l10n = L10n.of(context);
    final target = _target;
    if (target == null) return;
    final nx = local.dx / size.width;
    final ny = local.dy / size.height;
    final hit = _hotspots.where((h) {
      final dx = nx - h.x;
      final dy = ny - h.y;
      return sqrt(dx * dx + dy * dy) <= h.r * 1.35;
    }).toList();
    if (hit.any((h) => h.name == target.name)) {
      setState(() {
        _found.add(target.name);
        _feedback = l10n.mapCorrect;
        _pickNext();
      });
      return;
    }
    setState(() => _feedback = l10n.mapMiss);
  }

  void _submitName() {
    final l10n = L10n.of(context);
    final target = _target;
    if (target == null) return;
    final guess = _typed.text.trim().toLowerCase();
    if (guess.isEmpty) return;
    if (guess == target.name.toLowerCase()) {
      setState(() {
        _found.add(target.name);
        _feedback = l10n.mapCorrect;
        _pickNext();
      });
      return;
    }
    setState(() => _feedback = l10n.mapMiss);
  }
}

class _MapPainter extends CustomPainter {
  _MapPainter({
    required this.hotspots,
    required this.found,
    required this.ink,
    required this.muted,
  });

  final List<MapHotspot> hotspots;
  final Set<String> found;
  final Color ink;
  final Color muted;

  @override
  void paint(Canvas canvas, Size size) {
    final land = Paint()..color = ink.withValues(alpha: 0.16);
    final outline = Paint()
      ..color = ink.withValues(alpha: 0.45)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;
    final path = Path()
      ..moveTo(size.width * 0.18, size.height * 0.28)
      ..quadraticBezierTo(
        size.width * 0.42,
        size.height * 0.08,
        size.width * 0.62,
        size.height * 0.22,
      )
      ..quadraticBezierTo(
        size.width * 0.86,
        size.height * 0.30,
        size.width * 0.80,
        size.height * 0.52,
      )
      ..quadraticBezierTo(
        size.width * 0.72,
        size.height * 0.78,
        size.width * 0.40,
        size.height * 0.74,
      )
      ..quadraticBezierTo(
        size.width * 0.16,
        size.height * 0.62,
        size.width * 0.18,
        size.height * 0.28,
      )
      ..close();
    canvas.drawPath(path, land);
    canvas.drawPath(path, outline);
    for (final spot in hotspots) {
      final done = found.contains(spot.name);
      final paint = Paint()..color = done ? ink : muted.withValues(alpha: 0.55);
      canvas.drawCircle(
        Offset(spot.x * size.width, spot.y * size.height),
        spot.r * size.shortestSide,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _MapPainter oldDelegate) {
    return oldDelegate.found != found || oldDelegate.hotspots != hotspots;
  }
}
