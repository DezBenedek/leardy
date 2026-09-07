import 'package:flutter/widgets.dart';

/// Apró inline-formázás lecke-szövegekhez: `**félkövér**` és `*dőlt*`.
/// Lezáratlan jelölések szó szerint maradnak.
List<InlineSpan> lessonInlineSpans(String source, TextStyle? style) {
  final out = <InlineSpan>[];
  final boldRe = RegExp(r'\*\*(.+?)\*\*');
  var pos = 0;
  for (final match in boldRe.allMatches(source)) {
    if (match.start > pos) {
      out.addAll(_italicSpans(source.substring(pos, match.start), style));
    }
    out.add(
      TextSpan(
        text: match.group(1),
        style: (style ?? const TextStyle()).copyWith(
          fontWeight: FontWeight.w700,
        ),
      ),
    );
    pos = match.end;
  }
  if (pos < source.length) {
    out.addAll(_italicSpans(source.substring(pos), style));
  }
  if (out.isEmpty) out.add(TextSpan(text: source, style: style));
  return out;
}

List<InlineSpan> _italicSpans(String source, TextStyle? style) {
  final out = <InlineSpan>[];
  final italicRe = RegExp(r'\*(.+?)\*');
  var pos = 0;
  for (final match in italicRe.allMatches(source)) {
    if (match.start > pos) {
      out.add(TextSpan(text: source.substring(pos, match.start), style: style));
    }
    out.add(
      TextSpan(
        text: match.group(1),
        style: (style ?? const TextStyle()).copyWith(
          fontStyle: FontStyle.italic,
        ),
      ),
    );
    pos = match.end;
  }
  if (pos < source.length) {
    out.add(TextSpan(text: source.substring(pos), style: style));
  }
  return out;
}

/// Felsorolás-sor? (`- ` elejű sor.)
bool lessonLineIsBullet(String line) => line.trimLeft().startsWith('- ');

/// Levágja a `- ` jelet a felsorolás-sor elejéről.
String lessonBulletText(String line) {
  final trimmed = line.trimLeft();
  return trimmed.startsWith('- ') ? trimmed.substring(2) : trimmed;
}

/// Okos Enter-kezelés a tartalom-szerkesztőbe.
///
/// Ha a kurzornál egyetlen újsor szúródott be, és az előző sor
/// felsorolás (`- alma`) vagy számozott lista (`1. alma`), akkor
/// folytatja a listát, üres lista-jelnél pedig kilép belőle.
/// Minden más esetben `null`-t ad (nincs teendő).
///
/// Vissza: a javított szöveg és az új kurzorpozíció.
({String text, int offset})? applyLessonSmartEnter(
  String oldText,
  String newText,
) {
  if (newText.length != oldText.length + 1) return null;
  var inserted = -1;
  var prefix = 0;
  while (prefix < oldText.length &&
      prefix < newText.length &&
      oldText[prefix] == newText[prefix]) {
    prefix++;
  }
  if (prefix < newText.length &&
      newText[prefix] == '\n' &&
      newText.substring(0, prefix) + newText.substring(prefix + 1) ==
          oldText) {
    inserted = prefix;
  }
  if (inserted < 0) return null;
  final lineStart = newText.lastIndexOf('\n', inserted - 1) + 1;
  final prevLine = newText.substring(lineStart, inserted);

  final bullet = RegExp(r'^(\s*)- (.*)$').firstMatch(prevLine);
  if (bullet != null) {
    final indent = bullet.group(1)!;
    final rest = bullet.group(2)!;
    if (rest.trim().isEmpty) {
      // Üres pont: kilépés a listából.
      final markerAt = lineStart + indent.length;
      final text =
          newText.substring(0, markerAt) + newText.substring(markerAt + 2);
      return (text: text, offset: inserted - 2);
    }
    final marker = '$indent- ';
    final text =
        newText.substring(0, inserted + 1) +
        marker +
        newText.substring(inserted + 1);
    return (text: text, offset: inserted + 1 + marker.length);
  }

  final numbered = RegExp(r'^(\s*)(\d+)\. (.*)$').firstMatch(prevLine);
  if (numbered != null) {
    final indent = numbered.group(1)!;
    final number = int.parse(numbered.group(2)!);
    final rest = numbered.group(3)!;
    if (rest.trim().isEmpty) {
      final markerAt = lineStart + indent.length;
      final markerLen = numbered.group(2)!.length + 2;
      final text =
          newText.substring(0, markerAt) +
          newText.substring(markerAt + markerLen);
      return (text: text, offset: inserted - markerLen);
    }
    final marker = '$indent${number + 1}. ';
    final text =
        newText.substring(0, inserted + 1) +
        marker +
        newText.substring(inserted + 1);
    return (text: text, offset: inserted + 1 + marker.length);
  }

  return null;
}
