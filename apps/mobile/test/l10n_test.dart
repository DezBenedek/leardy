import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:leardy/l10n/l10n.dart';

void main() {
  test('card states are localized from English FSRS names', () {
    final hu = L10n(const Locale('hu'));
    expect(hu.emptyStepsEdit.contains('lépést'), isTrue);
    expect(hu.cardState('new'), 'Új');
    expect(hu.cardState('New'), 'Új');
    expect(hu.cardState('learning'), 'Tanulás');
    expect(hu.serverUnreachable, 'A Leardy nem érte el a szervert.');
    expect(hu.apiError('server_unreachable'), 'A Leardy nem érte el a szervert.');
    expect(hu.apiError('A füzet nem érte el a szervert.'), 'A Leardy nem érte el a szervert.');
    expect(hu.apiError('You are banned from this class'), 'Ki vagy tiltva ebből az osztályból.');
    expect(hu.deleteCard, 'Kártya törlése');
    expect(hu.deleteMaterial, 'Üzenet törlése');
    expect(hu.deleteCard, isNot(hu.deleteMaterial));
    expect(hu.removeFromLibrary, 'Eltávolítom');
    expect(hu.discoverTopics, 'Témakörök');
    expect(hu.discoverCardPacks, 'Tanulókártyák');

    final en = L10n(const Locale('en'));
    expect(en.cardState('new'), 'New');
    expect(en.tabToday, 'Today');
  });
}
