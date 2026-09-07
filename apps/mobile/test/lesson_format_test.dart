import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/domain/lesson_format.dart';

String plainText(List<InlineSpan> spans) {
  return spans
      .whereType<TextSpan>()
      .map((span) => span.text ?? '')
      .join();
}

void main() {
  test('plain text stays a single span', () {
    final spans = lessonInlineSpans('Sima szöveg', null);
    expect(spans, hasLength(1));
    expect(plainText(spans), 'Sima szöveg');
  });

  test('bold markers become a bold span', () {
    final spans = lessonInlineSpans('Ez **nagyon** fontos', null);
    expect(plainText(spans), 'Ez nagyon fontos');
    final bold = spans.whereType<TextSpan>().firstWhere(
      (span) => span.text == 'nagyon',
    );
    expect(bold.style?.fontWeight, FontWeight.w700);
  });

  test('italic markers become an italic span', () {
    final spans = lessonInlineSpans('Ez *dőlt* szöveg', null);
    expect(plainText(spans), 'Ez dőlt szöveg');
    final italic = spans.whereType<TextSpan>().firstWhere(
      (span) => span.text == 'dőlt',
    );
    expect(italic.style?.fontStyle, FontStyle.italic);
  });

  test('unclosed markers stay literal', () {
    final spans = lessonInlineSpans('Ez **nincs lezárva', null);
    expect(plainText(spans), 'Ez **nincs lezárva');
  });

  test('bullet detection trims leading space', () {
    expect(lessonLineIsBullet('- alma'), isTrue);
    expect(lessonLineIsBullet('  - alma'), isTrue);
    expect(lessonLineIsBullet('alma'), isFalse);
    expect(lessonBulletText('  - alma'), 'alma');
  });

  test('smart enter continues a bullet list', () {
    final result = applyLessonSmartEnter('- alma', '- alma\n');
    expect(result, isNotNull);
    expect(result!.text, '- alma\n- ');
    expect(result.offset, '- alma\n- '.length);
  });

  test('smart enter exits an empty bullet', () {
    final result = applyLessonSmartEnter('- ', '- \n');
    expect(result, isNotNull);
    expect(result!.text, '\n');
    expect(result.offset, 0);
  });

  test('smart enter continues a numbered list', () {
    final result = applyLessonSmartEnter('1. alma', '1. alma\n');
    expect(result, isNotNull);
    expect(result!.text, '1. alma\n2. ');
    expect(result.offset, '1. alma\n2. '.length);
  });

  test('smart enter ignores plain paragraphs', () {
    expect(applyLessonSmartEnter('hello', 'hello\n'), isNull);
  });
}
