import 'package:flutter/material.dart';
import 'package:leardy/domain/lesson_format.dart';

/// Lecke-szöveg megjelenítése az olvasóban: bekezdések, felsorolás,
/// `**félkövér**` és `*dőlt*` kiemelésekkel.
class LessonBodyText extends StatelessWidget {
  const LessonBodyText({super.key, required this.body, this.style});

  final String body;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final base = style ?? DefaultTextStyle.of(context).style;
    final lines = body.split('\n');
    final blocks = <List<String>>[];
    for (final line in lines) {
      if (line.trim().isEmpty) {
        blocks.add(const []);
        continue;
      }
      final bullet = lessonLineIsBullet(line);
      if (blocks.isEmpty ||
          blocks.last.isEmpty ||
          lessonLineIsBullet(blocks.last.last) != bullet) {
        blocks.add([line]);
      } else {
        blocks.last.add(line);
      }
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final block in blocks)
          if (block.isEmpty)
            const SizedBox(height: 8)
          else if (lessonLineIsBullet(block.first))
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final line in block)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('•  ', style: base),
                          Expanded(
                            child: Text.rich(
                              TextSpan(
                                children: lessonInlineSpans(
                                  lessonBulletText(line),
                                  base,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text.rich(
                TextSpan(
                  children: lessonInlineSpans(block.join('\n'), base),
                ),
              ),
            ),
      ],
    );
  }
}
