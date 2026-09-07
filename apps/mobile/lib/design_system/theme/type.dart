import 'package:flutter/material.dart';

abstract final class LeardyType {
  static TextStyle ui({
    double size = 15,
    FontWeight weight = FontWeight.w500,
    Color? color,
    double height = 1.35,
    double letterSpacing = -0.15,
  }) {
    return TextStyle(
      fontFamily: 'BricolageGrotesque',
      fontSize: size,
      fontWeight: weight,
      height: height,
      letterSpacing: letterSpacing,
      color: color,
    );
  }

  static TextStyle newsreader({
    double size = 16,
    FontWeight weight = FontWeight.w400,
    Color? color,
    double height = 1.35,
    double letterSpacing = -0.2,
  }) {
    return TextStyle(
      inherit: false,
      fontFamily: 'Newsreader',
      fontFamilyFallback: const ['Georgia', 'serif'],
      fontSize: size,
      fontWeight: weight,
      height: height,
      letterSpacing: letterSpacing,
      color: color,
    );
  }

  static TextStyle bricolage({
    double size = 13,
    FontWeight weight = FontWeight.w600,
    Color? color,
    double height = 1.25,
    double letterSpacing = -0.1,
  }) =>
      ui(size: size, weight: weight, color: color, height: height, letterSpacing: letterSpacing);
}
