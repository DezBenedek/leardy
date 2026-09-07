class SeedCard {
  const SeedCard(this.front, this.back, {this.hint, this.example});
  final String front;
  final String back;
  final String? hint;
  final String? example;
}

class SeedDeck {
  const SeedDeck(this.name, this.description, this.cards);
  final String name;
  final String description;
  final List<SeedCard> cards;
}

class SeedSubject {
  const SeedSubject(this.name, this.colorKey, this.decks);
  final String name;
  final String colorKey;
  final List<SeedDeck> decks;
}

class SubjectCategory {
  static const languages = 'languages';
  static const humanities = 'humanities';
  static const stem = 'stem';
  static const arts = 'arts';
  static const other = 'other';

  static const displayOrder = [languages, humanities, stem, arts, other];
}

/// Stabil, nyelv-független tantárgy-azonosítók.
/// A DB-ben (subjects.name, bundles.subject) ezeket tároljuk,
/// a megjelenített nevet a l10n `subjectLabel()` adja.
class SubjectIds {
  static const nyelvtan = 'nyelvtan';
  static const angol = 'angol';
  static const nemet = 'nemet';
  static const olasz = 'olasz';
  static const irodalom = 'irodalom';
  static const tortenelem = 'tortenelem';
  static const hittan = 'hittan';
  static const matematika = 'matematika';
  static const digitalisKultura = 'digitalis-kultura';
  static const fizika = 'fizika';
  static const kemia = 'kemia';
  static const biologia = 'biologia';
  static const foldrajz = 'foldrajz';
  static const termeszettudomany = 'termeszettudomany';
  static const enekZene = 'enek-zene';
  static const testneveles = 'testneveles';
  static const egyeb = 'egyeb';
}

class SubjectDef {
  const SubjectDef(this.id, this.huName, this.colorKey, this.category);
  final String id;
  final String huName;
  final String colorKey;
  final String category;
}

const subjectDefs = [
  SubjectDef(SubjectIds.nyelvtan, 'Nyelvtan', 'wine', SubjectCategory.humanities),
  SubjectDef(SubjectIds.angol, 'Angol', 'slate', SubjectCategory.languages),
  SubjectDef(SubjectIds.nemet, 'Német', 'ochre', SubjectCategory.languages),
  SubjectDef(SubjectIds.olasz, 'Olasz', 'wine', SubjectCategory.languages),
  SubjectDef(SubjectIds.irodalom, 'Irodalom', 'wine', SubjectCategory.humanities),
  SubjectDef(SubjectIds.tortenelem, 'Történelem', 'wine', SubjectCategory.humanities),
  SubjectDef(SubjectIds.hittan, 'Hittan', 'ochre', SubjectCategory.humanities),
  SubjectDef(SubjectIds.matematika, 'Matematika', 'slate', SubjectCategory.stem),
  SubjectDef(SubjectIds.digitalisKultura, 'Digitális Kultúra', 'slate', SubjectCategory.stem),
  SubjectDef(SubjectIds.fizika, 'Fizika', 'slate', SubjectCategory.stem),
  SubjectDef(SubjectIds.kemia, 'Kémia', 'ochre', SubjectCategory.stem),
  SubjectDef(SubjectIds.biologia, 'Biológia', 'forest', SubjectCategory.stem),
  SubjectDef(SubjectIds.foldrajz, 'Földrajz', 'forest', SubjectCategory.stem),
  SubjectDef(SubjectIds.termeszettudomany, 'Természettudomány', 'forest', SubjectCategory.stem),
  SubjectDef(SubjectIds.enekZene, 'Ének-zene', 'wine', SubjectCategory.arts),
  SubjectDef(SubjectIds.testneveles, 'Testnevelés', 'forest', SubjectCategory.arts),
  SubjectDef(SubjectIds.egyeb, 'Egyéb', 'slate', SubjectCategory.other),
];

class FixedSubject {
  const FixedSubject(this.name, this.colorKey, this.category);
  final String name;
  final String colorKey;
  final String category;
}

/// Visszafelé kompatibilis lista: most már az ID-kat tartalmazza `name`-ként,
/// hogy a régi, név-alapú kód fokozatosan átírható legyen.
final fixedSubjects = [
  for (final def in subjectDefs)
    FixedSubject(def.id, def.colorKey, def.category),
];

const subjectRenames = {
  'magyar nyelv': 'Nyelvtan',
  'hit- és erkölcstan': 'Hittan',
  'digitális kultúra': 'Digitális Kultúra',
};

/// Magyar megjelenítési név -> stabil ID (pl. 'Angol' -> 'angol').
/// Már-ID bemenetet változatlanul visszaad.
String subjectIdForName(String raw) {
  final needle = raw.trim().toLowerCase();
  if (needle.isEmpty) return SubjectIds.egyeb;
  for (final def in subjectDefs) {
    if (def.id == needle) return def.id;
  }
  final renamed = subjectRenames[needle];
  final target = (renamed ?? raw).trim().toLowerCase();
  for (final def in subjectDefs) {
    if (def.huName.toLowerCase() == target) return def.id;
  }
  return SubjectIds.egyeb;
}

String subjectHuNameFor(String idOrName) {
  final id = subjectIdForName(idOrName);
  for (final def in subjectDefs) {
    if (def.id == id) return def.huName;
  }
  return idOrName;
}

bool isSubjectId(String raw) {
  final needle = raw.trim().toLowerCase();
  return subjectDefs.any((def) => def.id == needle);
}

bool isOfficialSubject(String name) {
  final needle = name.trim().toLowerCase();
  if (isSubjectId(needle)) return true;
  final renamed = subjectRenames[needle];
  final target = (renamed ?? name).trim().toLowerCase();
  return subjectDefs.any((def) => def.huName.toLowerCase() == target);
}

String categoryForSubject(String name) {
  final id = subjectIdForName(name);
  for (final def in subjectDefs) {
    if (def.id == id) return def.category;
  }
  return SubjectCategory.other;
}

String colorKeyForSubject(String name) {
  final id = subjectIdForName(name);
  for (final def in subjectDefs) {
    if (def.id == id) return def.colorKey;
  }
  return 'slate';
}

int subjectOrderFor(String name) {
  final id = subjectIdForName(name);
  final index = subjectDefs.indexWhere((def) => def.id == id);
  return index < 0 ? subjectDefs.length : index;
}

const seedCatalog = [
  SeedSubject(SubjectIds.angol, 'slate', [
    SeedDeck('Konyhai igék', 'Hétköznapi konyha', [
      SeedCard('forral', 'boil', hint: 'víz', example: 'Forralj vizet a teához.'),
      SeedCard('süt', 'bake / fry', hint: 'sütő vagy serpenyő'),
      SeedCard('vág', 'cut / chop', example: 'Vágd fel a hagymát.'),
      SeedCard('kever', 'stir'),
      SeedCard('ízesít', 'season'),
      SeedCard('párol', 'steam'),
      SeedCard('olvaszt', 'melt'),
      SeedCard('szeletel', 'slice'),
      SeedCard('habar', 'whisk'),
      SeedCard('locsol', 'drizzle'),
      SeedCard('pirít', 'toast / roast'),
      SeedCard('tálal', 'serve'),
    ]),
    SeedDeck('Iskolai szavak', 'Tanterem és füzet', [
      SeedCard('füzet', 'notebook'),
      SeedCard('tanár', 'teacher'),
      SeedCard('házi feladat', 'homework'),
      SeedCard('dolgozat', 'test / exam'),
      SeedCard('szünet', 'break'),
      SeedCard('tábla', 'blackboard / board'),
      SeedCard('toll', 'pen'),
      SeedCard('ceruza', 'pencil'),
      SeedCard('radír', 'eraser'),
      SeedCard('óra', 'lesson / class'),
      SeedCard('jegy', 'grade / mark'),
      SeedCard('szótár', 'dictionary'),
    ]),
  ]),
  SeedSubject(SubjectIds.tortenelem, 'wine', [
    SeedDeck('Honfoglalás', 'Rövid tények', [
      SeedCard('Honfoglalás évszázada', '9. század vége', hint: 'Árpád'),
      SeedCard('Géza fejedelem', 'István apja, államalapítás előkészítése'),
      SeedCard('Szent István', 'Első magyar király, 1000/1001'),
      SeedCard('Koronázás helye', 'Esztergom / Székesfehérvár hagyomány'),
      SeedCard('Tized', 'Egyházi adó'),
      SeedCard('Vármegye', 'Királyi közigazgatási egység'),
      SeedCard('Szent László', 'Lovagkirály, 11. század'),
      SeedCard('Könyves Kálmán', 'Törvénykező király'),
      SeedCard('Aranybulla', '1222, II. András'),
      SeedCard('Tatárjárás', '1241–42'),
      SeedCard('IV. Béla', 'Második honalapító'),
      SeedCard('Mohács', '1526'),
    ]),
  ]),
  SeedSubject(SubjectIds.biologia, 'forest', [
    SeedDeck('Sejt', 'Alapfogalmak', [
      SeedCard('Sejtmag', 'A sejt örökítőanyagát őrzi'),
      SeedCard('Mitokondrium', 'Energiatermelés'),
      SeedCard('Kloroplasztisz', 'Fotoszintézis a növényi sejtben'),
      SeedCard('Sejthártya', 'Anyagáramlás szabályozása'),
      SeedCard('Citoplazma', 'Sejten belüli közeg'),
      SeedCard('Riboszóma', 'Fehérjeszintézis'),
      SeedCard('DNS', 'Örökítőanyag'),
      SeedCard('Fotoszintézis', 'Fényből szerves anyag'),
      SeedCard('Légzés', 'Energiafelszabadítás'),
      SeedCard('Osztódás', 'Mitózis / meiózis'),
      SeedCard('Szövet', 'Hasonló sejtek együttese'),
      SeedCard('Szerv', 'Szövetekből álló működési egység'),
    ]),
  ]),
];

class SeedLessonPage {
  const SeedLessonPage(this.body);
  final String body;
}

const honfoglalasLessonTitle = 'A honfoglalás';

const honfoglalasLessonPages = [
  SeedLessonPage(
    'A honfoglalás a 9. század végén történt. Árpád vezetésével a magyar törzsek a Kárpát-medencébe költöztek, és itt telepedtek le.',
  ),
  SeedLessonPage(
    'A Kárpátokat a Vereckei-hágón át lépték át. Előtte Etelközben éltek, a pontusi sztyeppén. A honfoglalás nem egyetlen csata volt, hanem több hullámban lezajló beköltözés.',
  ),
  SeedLessonPage(
    'Géza fejedelem a 10. század végén előkészítette az államalapítást. Fia, István lett az első magyar király 1000 vagy 1001 körül. A vármegyék és az egyházszervezet az új királyság gerincét adták.',
  ),
];

const honfoglalasLessonTwoTitle = 'Államalapítás';

const honfoglalasLessonTwoPages = [
  SeedLessonPage(
    'Géza fejedelem a kereszténység felé fordította a magyarságot. Fiát, Vajkot István néven keresztelték, és ő lett az első magyar király.',
  ),
  SeedLessonPage(
    'István vármegyéket és egyházmegyéket szervezett. Az államalapítás a királyi hatalom, az írásbeliség és a keresztény intézményrendszer megteremtését jelentette.',
  ),
];

const honfoglalasHotspots = [
  {'x': 0.74, 'y': 0.36, 'r': 0.055, 'name': 'Etelköz'},
  {'x': 0.58, 'y': 0.40, 'r': 0.05, 'name': 'Vereckei-hágó'},
  {'x': 0.36, 'y': 0.48, 'r': 0.06, 'name': 'Pannónia'},
  {'x': 0.50, 'y': 0.54, 'r': 0.05, 'name': 'Erdély'},
  {'x': 0.34, 'y': 0.38, 'r': 0.045, 'name': 'Esztergom'},
];
