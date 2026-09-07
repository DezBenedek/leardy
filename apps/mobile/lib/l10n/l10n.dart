import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:leardy/domain/models.dart';

class L10nLang {
  const L10nLang(this.code, this.label);
  final String code;
  final String label;

  static const all = [
    L10nLang('hu', 'Magyar'),
    L10nLang('en', 'English'),
    L10nLang('de', 'Deutsch'),
    L10nLang('it', 'Italiano'),
    L10nLang('es', 'Español'),
  ];
}

class L10n {
  L10n(this.locale);

  final Locale locale;

  static const supported = [
    Locale('hu'),
    Locale('en'),
    Locale('de'),
    Locale('it'),
    Locale('es'),
  ];

  static const delegate = _L10nDelegate();

  static L10n of(BuildContext context) {
    return Localizations.of<L10n>(context, L10n) ?? L10n(const Locale('hu'));
  }

  String get _c => locale.languageCode;

  String _t(String hu, {String? en, String? de, String? it, String? es}) {
    return switch (_c) {
      'en' => en ?? hu,
      'de' => de ?? en ?? hu,
      'it' => it ?? en ?? hu,
      'es' => es ?? en ?? hu,
      _ => hu,
    };
  }

  String get appName => 'Leardy';

  String get tabToday =>
      _t('Ma', en: 'Today', de: 'Heute', it: 'Oggi', es: 'Hoy');
  String get tabCards =>
      _t('Tanulás', en: 'Study', de: 'Lernen', it: 'Studio', es: 'Estudio');
  String get tabClassroom => _t(
    'Tanterem',
    en: 'Classroom',
    de: 'Klassenraum',
    it: 'Classe',
    es: 'Aula',
  );
  String get tabSettings => _t(
    'Beállítások',
    en: 'Settings',
    de: 'Einstellungen',
    it: 'Impostazioni',
    es: 'Ajustes',
  );
  String get homeTab =>
      _t('Kezdőlap', en: 'Home', de: 'Start', it: 'Home', es: 'Inicio');

  String get guestMode => _t(
    'Vendég mód',
    en: 'Guest mode',
    de: 'Gastmodus',
    it: 'Modalità ospite',
    es: 'Modo invitado',
  );
  String get guest =>
      _t('Vendég', en: 'Guest', de: 'Gast', it: 'Ospite', es: 'Invitado');
  String get account =>
      _t('Fiók', en: 'Account', de: 'Konto', it: 'Account', es: 'Cuenta');
  String get login =>
      _t('Belépés', en: 'Sign in', de: 'Anmelden', it: 'Accedi', es: 'Entrar');
  String get appearance => _t(
    'Megjelenés',
    en: 'Appearance',
    de: 'Darstellung',
    it: 'Aspetto',
    es: 'Apariencia',
  );
  String get appearanceSubtitle => _t(
    'Világos, sötét, vagy a rendszer követése.',
    en: 'Light, dark, or follow the system.',
    de: 'Hell, dunkel oder System folgen.',
    it: 'Chiaro, scuro o come il sistema.',
    es: 'Claro, oscuro o según el sistema.',
  );
  String get themeSystem =>
      _t('Rendszer', en: 'System', de: 'System', it: 'Sistema', es: 'Sistema');
  String get themeLight =>
      _t('Világos', en: 'Light', de: 'Hell', it: 'Chiaro', es: 'Claro');
  String get themeDark =>
      _t('Sötét', en: 'Dark', de: 'Dunkel', it: 'Scuro', es: 'Oscuro');

  String get language =>
      _t('Nyelv', en: 'Language', de: 'Sprache', it: 'Lingua', es: 'Idioma');
  String get languageSubtitle => _t(
    'A Leardy nyelve. Alapból magyar.',
    en: 'Leardy language. Hungarian is the default.',
    de: 'Sprache von Leardy. Ungarisch ist die Vorgabe.',
    it: 'Lingua di Leardy. L’ungherese è l’impostazione predefinita.',
    es: 'Idioma de Leardy. El húngaro es el predeterminado.',
  );

  String get homeReady => _t(
    'Készen állsz mára?',
    en: 'Ready for today?',
    de: 'Bereit für heute?',
    it: 'Pronto per oggi?',
    es: '¿Listo para hoy?',
  );
  String helloName(String name) => _t(
    'Szia, $name',
    en: 'Hi, $name',
    de: 'Hallo, $name',
    it: 'Ciao, $name',
    es: 'Hola, $name',
  );
  String get dueLabel => _t(
    'esedékes',
    en: 'due',
    de: 'fällig',
    it: 'in scadenza',
    es: 'pendientes',
  );
  String get doneToday => _t(
    'kész ma',
    en: 'done today',
    de: 'heute fertig',
    it: 'fatte oggi',
    es: 'hechas hoy',
  );
  String get studyToday => _t(
    'Mai kártyák',
    en: 'Today’s cards',
    de: 'Karten von heute',
    it: 'Carte di oggi',
    es: 'Tarjetas de hoy',
  );
  String get continueStudy => _t(
    'Folytasd',
    en: 'Continue',
    de: 'Weiter',
    it: 'Continua',
    es: 'Seguir',
  );
  String get caughtUp => _t(
    'Ma minden kész.',
    en: 'You’re caught up today.',
    de: 'Heute ist alles erledigt.',
    it: 'Per oggi hai finito.',
    es: 'Hoy ya está todo.',
  );
  String get dueDecks => _t(
    'Esedékes szettek',
    en: 'Due decks',
    de: 'Fällige Stapel',
    it: 'Mazzi in scadenza',
    es: 'Mazos pendientes',
  );
  String get last28 => _t(
    'Elmúlt 28 nap',
    en: 'Last 28 days',
    de: 'Letzte 28 Tage',
    it: 'Ultimi 28 giorni',
    es: 'Últimos 28 días',
  );
  String cardsCount(int n) => _t(
    '$n kártya',
    en: '$n cards',
    de: '$n Karten',
    it: '$n carte',
    es: '$n tarjetas',
  );
  String get streak =>
      _t('Sorozat', en: 'Streak', de: 'Serie', it: 'Serie', es: 'Racha');
  String get streakNone => _t(
    'Még nincs aktív napod',
    en: 'No active day yet',
    de: 'Noch kein aktiver Tag',
    it: 'Nessun giorno attivo',
    es: 'Aún no hay un día activo',
  );
  String streakDays(int days) => _t(
    '$days nap egymás után',
    en: '$days days in a row',
    de: '$days Tage hintereinander',
    it: '$days giorni di fila',
    es: '$days días seguidos',
  );
  String get reminderBanner => _t(
    'Ma még nem gyakoroltál. A napi sorozat vár.',
    en: 'You have not practiced today. Your streak is waiting.',
    de: 'Heute noch nicht geübt. Die Serie wartet.',
    it: 'Oggi non hai ancora studiato. La serie ti aspetta.',
    es: 'Hoy aún no has practicado. La racha te espera.',
  );

  String get noSubjects => _t(
    'Még nincs tantárgyad.',
    en: 'You have no subjects yet.',
    de: 'Noch keine Fächer.',
    it: 'Non hai ancora materie.',
    es: 'Aún no tienes asignaturas.',
  );
  String get noDecks => _t(
    'Ehhez a tantárgyhoz nincs szett.',
    en: 'This subject has no decks.',
    de: 'Dieses Fach hat keine Stapel.',
    it: 'Questa materia non ha mazzi.',
    es: 'Esta asignatura no tiene mazos.',
  );
  String get allSets => _t(
    'Összes szett',
    en: 'All decks',
    de: 'Alle Stapel',
    it: 'Tutti i mazzi',
    es: 'Todos los mazos',
  );
  String get allSubjects => _t(
    'Minden tantárgy',
    en: 'All subjects',
    de: 'Alle Fächer',
    it: 'Tutte le materie',
    es: 'Todas las asignaturas',
  );
  String get allClasses => _t(
    'Minden osztály',
    en: 'All classes',
    de: 'Alle Klassen',
    it: 'Tutte le classi',
    es: 'Todas las clases',
  );
  String get newSet => _t(
    'Új szett',
    en: 'New deck',
    de: 'Neuer Stapel',
    it: 'Nuovo mazzo',
    es: 'Nuevo mazo',
  );
  String get newSubject => _t(
    'Új tantárgy',
    en: 'New subject',
    de: 'Neues Fach',
    it: 'Nuova materia',
    es: 'Nueva asignatura',
  );
  String get setName => _t(
    'Szett neve',
    en: 'Deck name',
    de: 'Name des Stapels',
    it: 'Nome del mazzo',
    es: 'Nombre del mazo',
  );
  String get subjectName => _t(
    'Tantárgy neve',
    en: 'Subject name',
    de: 'Name des Fachs',
    it: 'Nome della materia',
    es: 'Nombre de la asignatura',
  );
  String get assignSubject => _t(
    'Tantárgy',
    en: 'Subject',
    de: 'Fach',
    it: 'Materia',
    es: 'Asignatura',
  );
  String get pickSubject => _t(
    'Válassz tantárgyat',
    en: 'Choose a subject',
    de: 'Fach wählen',
    it: 'Scegli una materia',
    es: 'Elige una asignatura',
  );
  String get recentSubjects => _t(
    'Legutóbbi',
    en: 'Recent',
    de: 'Zuletzt verwendet',
    it: 'Recenti',
    es: 'Recientes',
  );

  String subjectCategoryLabel(String key) => switch (key) {
    'languages' => _t(
      'Nyelvek',
      en: 'Languages',
      de: 'Sprachen',
      it: 'Lingue',
      es: 'Idiomas',
    ),
    'humanities' => _t(
      'Humán',
      en: 'Humanities',
      de: 'Geisteswissenschaften',
      it: 'Umanistiche',
      es: 'Humanidades',
    ),
    'stem' => _t(
      'Reál',
      en: 'STEM',
      de: 'MINT',
      it: 'Scientifiche',
      es: 'Ciencias',
    ),
    'arts' => _t(
      'Művészet és sport',
      en: 'Arts and sports',
      de: 'Kunst und Sport',
      it: 'Arte e sport',
      es: 'Arte y deporte',
    ),
    'other' => _t(
      'Egyéb',
      en: 'Other',
      de: 'Sonstiges',
      it: 'Altro',
      es: 'Otros',
    ),
    _ => key,
  };
  String get editSet => _t(
    'Szett szerkesztése',
    en: 'Edit deck',
    de: 'Stapel bearbeiten',
    it: 'Modifica mazzo',
    es: 'Editar mazo',
  );
  String get editCard => _t(
    'Kártya szerkesztése',
    en: 'Edit card',
    de: 'Karte bearbeiten',
    it: 'Modifica carta',
    es: 'Editar tarjeta',
  );
  String get addCard => _t(
    'Kártya hozzáadása',
    en: 'Add card',
    de: 'Karte hinzufügen',
    it: 'Aggiungi carta',
    es: 'Añadir tarjeta',
  );
  String get emptyCards => _t(
    'Még nincs kártya ebben a szettben.',
    en: 'This set has no cards yet.',
    de: 'Dieser Stapel hat noch keine Karten.',
    it: 'Questo mazzo non ha ancora carte.',
    es: 'Este mazo aún no tiene tarjetas.',
  );
  String get cardFront =>
      _t('Kérdés', en: 'Prompt', de: 'Frage', it: 'Domanda', es: 'Pregunta');
  String get cardBackLabel => _t(
    'Válasz',
    en: 'Answer',
    de: 'Antwort',
    it: 'Risposta',
    es: 'Respuesta',
  );
  String get cardPrompt => cardFront;
  String get cardAnswer => cardBackLabel;
  String get deleteCard => _t(
    'Kártya törlése',
    en: 'Delete card',
    de: 'Karte löschen',
    it: 'Elimina carta',
    es: 'Eliminar tarjeta',
  );
  String get deleteSet => _t(
    'Szett törlése',
    en: 'Delete deck',
    de: 'Stapel löschen',
    it: 'Elimina mazzo',
    es: 'Eliminar mazo',
  );
  String get readOnlySet => _t(
    'Csak olvasás',
    en: 'Read only',
    de: 'Nur lesen',
    it: 'Solo lettura',
    es: 'Solo lectura',
  );
  String get editors => _t(
    'Szerkesztők',
    en: 'Editors',
    de: 'Bearbeiter',
    it: 'Editori',
    es: 'Editores',
  );
  String get addEditor => _t(
    'Szerkesztő hozzáadása',
    en: 'Add editor',
    de: 'Bearbeiter hinzufügen',
    it: 'Aggiungi editor',
    es: 'Añadir editor',
  );
  String get editorEmail => _t(
    'Szerkesztő emailje',
    en: 'Editor email',
    de: 'E-Mail des Bearbeiters',
    it: 'Email dell’editor',
    es: 'Correo del editor',
  );
  String get pickSet => _t(
    'Válassz szettet',
    en: 'Choose a deck',
    de: 'Stapel wählen',
    it: 'Scegli un mazzo',
    es: 'Elige un mazo',
  );
  String get swipeHint => _t(
    'Balra: nem tudom · Jobbra: tudom',
    en: 'Left: don’t know · Right: I know',
    de: 'Links: weiß ich nicht · Rechts: weiß ich',
    it: 'Sinistra: non so · Destra: so',
    es: 'Izquierda: no sé · Derecha: lo sé',
  );
  String get swipeKnow =>
      _t('Tudom', en: 'I know', de: 'Weiß ich', it: 'Lo so', es: 'Lo sé');
  String get swipeDont => _t(
    'Nem tudom',
    en: 'Don’t know',
    de: 'Weiß ich nicht',
    it: 'Non lo so',
    es: 'No lo sé',
  );
  String get ownedByYou =>
      _t('Saját', en: 'Yours', de: 'Deins', it: 'Tuo', es: 'Tuyo');
  String get noOwnSets => _t(
    'Még nincs saját szetted.',
    en: 'You have no decks yet.',
    de: 'Du hast noch keine Stapel.',
    it: 'Non hai ancora mazzi.',
    es: 'Aún no tienes mazos.',
  );
  String dueCards(int due, int total) => _t(
    '$due esedékes · $total kártya',
    en: '$due due · $total cards',
    de: '$due fällig · $total Karten',
    it: '$due in scadenza · $total carte',
    es: '$due pendientes · $total tarjetas',
  );
  String get filters =>
      _t('Szűrők', en: 'Filters', de: 'Filter', it: 'Filtri', es: 'Filtros');
  String get filterAll =>
      _t('Mind', en: 'All', de: 'Alle', it: 'Tutti', es: 'Todos');
  String get filterDue => _t(
    'Csak esedékes',
    en: 'Due only',
    de: 'Nur fällige',
    it: 'Solo in scadenza',
    es: 'Solo pendientes',
  );
  String get filterNew => _t(
    'Csak új',
    en: 'New only',
    de: 'Nur neue',
    it: 'Solo nuove',
    es: 'Solo nuevas',
  );
  String get filterAbc => _t('A–Z', en: 'A–Z', de: 'A–Z', it: 'A–Z', es: 'A–Z');
  String get subject => _t(
    'Tantárgy',
    en: 'Subject',
    de: 'Fach',
    it: 'Materia',
    es: 'Asignatura',
  );
  String get subjectSubtitle => _t(
    'Ebből jönnek a szettjeid.',
    en: 'Your decks come from here.',
    de: 'Deine Stapel kommen von hier.',
    it: 'I mazzi arrivano da qui.',
    es: 'Tus mazos salen de aquí.',
  );
  String setsCount(int n) => _t(
    '$n szett',
    en: '$n decks',
    de: '$n Stapel',
    it: '$n mazzi',
    es: '$n mazos',
  );

  String get deck =>
      _t('Szett', en: 'Deck', de: 'Stapel', it: 'Mazzo', es: 'Mazo');
  String cardsDueLine(int cards, int due) => _t(
    '$cards kártya, $due esedékes',
    en: '$cards cards, $due due',
    de: '$cards Karten, $due fällig',
    it: '$cards carte, $due in scadenza',
    es: '$cards tarjetas, $due pendientes',
  );
  String get practice => _t(
    'Gyakorlás',
    en: 'Practice',
    de: 'Üben',
    it: 'Esercitati',
    es: 'Practicar',
  );
  String get howPractice => _t(
    'Hogyan gyakorolsz?',
    en: 'How do you practice?',
    de: 'Wie übst du?',
    it: 'Come vuoi esercitarti?',
    es: '¿Cómo quieres practicar?',
  );
  String get flip =>
      _t('Fordítás', en: 'Flip', de: 'Umdrehen', it: 'Gira', es: 'Voltear');
  String get flipHint => _t(
    'Fordítsd, húzd jobbra vagy balra',
    en: 'Flip, then swipe right or left',
    de: 'Umdrehen, dann nach rechts oder links wischen',
    it: 'Gira, poi scorri a destra o sinistra',
    es: 'Voltea, luego desliza a la derecha o izquierda',
  );
  String get type =>
      _t('Gépelés', en: 'Type', de: 'Tippen', it: 'Scrivi', es: 'Escribir');
  String get choice => _t(
    'Feleletválasztó',
    en: 'Multiple choice',
    de: 'Auswahl',
    it: 'Scelta multipla',
    es: 'Opción múltiple',
  );
  String get testMode =>
      _t('Teszt', en: 'Test', de: 'Test', it: 'Test', es: 'Test');
  String get testModeHint => _t(
    'Vegyes: írás és választás keverve',
    en: 'Mixed: typing and choice',
    de: 'Gemischt: Tippen und Auswahl',
    it: 'Misto: scrittura e scelta',
    es: 'Mixto: escritura y opción',
  );
  String get options => _t(
    'Opciók',
    en: 'Options',
    de: 'Optionen',
    it: 'Opzioni',
    es: 'Opciones',
  );

  String get cardStateNew =>
      _t('Új', en: 'New', de: 'Neu', it: 'Nuova', es: 'Nueva');
  String get cardStateLearning => _t(
    'Tanulás',
    en: 'Learning',
    de: 'Lernen',
    it: 'Apprendimento',
    es: 'Aprendiendo',
  );
  String get cardStateReview => _t(
    'Ismétlés',
    en: 'Review',
    de: 'Wiederholung',
    it: 'Ripasso',
    es: 'Repaso',
  );
  String get cardStateRelearning => _t(
    'Újra',
    en: 'Relearning',
    de: 'Neu lernen',
    it: 'Ripresa',
    es: 'Reaprendizaje',
  );

  String cardState(String raw) {
    return switch (raw.toLowerCase()) {
      'new' => cardStateNew,
      'learning' => cardStateLearning,
      'review' => cardStateReview,
      'relearning' => cardStateRelearning,
      _ => raw,
    };
  }

  String get tip =>
      _t('Tipp', en: 'Hint', de: 'Tipp', it: 'Suggerimento', es: 'Pista');
  String get tapToFlip => _t(
    'koppints a fordításhoz',
    en: 'tap to flip',
    de: 'tippen zum Umdrehen',
    it: 'tocca per girare',
    es: 'toca para voltear',
  );
  String get cardBack => cardBackLabel;
  String get gradeAgain =>
      _t('Még nem', en: 'Again', de: 'Nochmal', it: 'Ancora', es: 'Otra vez');
  String get gradeHard =>
      _t('Nehéz', en: 'Hard', de: 'Schwer', it: 'Difficile', es: 'Difícil');
  String get gradeGood =>
      _t('Tudom', en: 'Good', de: 'Gut', it: 'Bene', es: 'Bien');
  String get gradeEasy =>
      _t('Könnyű', en: 'Easy', de: 'Leicht', it: 'Facile', es: 'Fácil');
  String get otherSide => _t(
    'A másik oldal',
    en: 'The other side',
    de: 'Die andere Seite',
    it: 'L’altro lato',
    es: 'El otro lado',
  );
  String get check => _t(
    'Ellenőrzés',
    en: 'Check',
    de: 'Prüfen',
    it: 'Controlla',
    es: 'Comprobar',
  );
  String get doneForToday => _t(
    'Kész a mai sor.',
    en: 'Done for today.',
    de: 'Für heute fertig.',
    it: 'Fatto per oggi.',
    es: 'Listo por hoy.',
  );
  String get flipFirst => _t(
    'Előbb fordítsd meg a kártyát.',
    en: 'Flip the card first.',
    de: 'Dreh zuerst die Karte um.',
    it: 'Gira prima la carta.',
    es: 'Primero voltea la tarjeta.',
  );

  String get settingsApp =>
      _t('Alkalmazás', en: 'App', de: 'App', it: 'App', es: 'App');
  String get settingsAccount =>
      _t('Fiók', en: 'Account', de: 'Konto', it: 'Account', es: 'Cuenta');
  String get about =>
      _t('Névjegy', en: 'About', de: 'Über', it: 'Info', es: 'Acerca de');
  String get noEmail => _t(
    'Nincs email',
    en: 'No email',
    de: 'Keine E-Mail',
    it: 'Nessuna email',
    es: 'Sin correo',
  );
  String get noEmailSet => _t(
    'Nincs email megadva',
    en: 'No email set',
    de: 'Keine E-Mail hinterlegt',
    it: 'Nessuna email impostata',
    es: 'Sin correo guardado',
  );
  String get loginForClassroom => _t(
    'Lépj be a Tanteremhez',
    en: 'Sign in for Classroom',
    de: 'Für den Klassenraum anmelden',
    it: 'Accedi per la Classe',
    es: 'Entra para el Aula',
  );
  String get reminders => _t(
    'Emlékeztetők',
    en: 'Reminders',
    de: 'Erinnerungen',
    it: 'Promemoria',
    es: 'Recordatorios',
  );
  String get remindersSubtitle => _t(
    'Napi jelzés, ha még nem gyakoroltál.',
    en: 'A daily nudge if you have not practiced.',
    de: 'Ein täglicher Hinweis, wenn du noch nicht geübt hast.',
    it: 'Un avviso giornaliero se non hai ancora studiato.',
    es: 'Un aviso diario si aún no has practicado.',
  );
  String get reminderOn => _t(
    'Napi emlékeztető',
    en: 'Daily reminder',
    de: 'Tägliche Erinnerung',
    it: 'Promemoria giornaliero',
    es: 'Recordatorio diario',
  );
  String get reminderTime =>
      _t('Időpont', en: 'Time', de: 'Uhrzeit', it: 'Orario', es: 'Hora');
  String get dailyGoal => _t(
    'Napi cél',
    en: 'Daily goal',
    de: 'Tagesziel',
    it: 'Obiettivo giornaliero',
    es: 'Meta diaria',
  );
  String cardsPerDay(int n) => _t(
    '$n kártya/nap',
    en: '$n cards/day',
    de: '$n Karten/Tag',
    it: '$n carte/giorno',
    es: '$n tarjetas/día',
  );
  String goalRemaining(int n) => _t(
    'Még $n kártya a mai célodhoz.',
    en: '$n more cards for today.',
    de: 'Noch $n Karten für heute.',
    it: 'Ancora $n carte per oggi.',
    es: 'Te faltan $n tarjetas hoy.',
  );
  String get goalDone => _t(
    'Mai cél teljesítve!',
    en: 'Daily goal done!',
    de: 'Tagesziel erreicht!',
    it: 'Obiettivo di oggi raggiunto!',
    es: '¡Meta de hoy cumplida!',
  );
  String get loginOrRegister => _t(
    'Belépés vagy regisztráció',
    en: 'Sign in or register',
    de: 'Anmelden oder registrieren',
    it: 'Accedi o registrati',
    es: 'Entrar o registrarse',
  );
  String get manageAccount => _t(
    'Fiók kezelése',
    en: 'Manage account',
    de: 'Konto verwalten',
    it: 'Gestisci account',
    es: 'Gestionar cuenta',
  );
  String get sync => _t(
    'Szinkron',
    en: 'Sync',
    de: 'Sync',
    it: 'Sincronizza',
    es: 'Sincronizar',
  );
  String get syncLoggedIn => _t(
    'Bejelentkezve',
    en: 'Signed in',
    de: 'Angemeldet',
    it: 'Accesso effettuato',
    es: 'Sesión iniciada',
  );
  String get syncNeedAccount => _t(
    'Csak fiókkal',
    en: 'Account required',
    de: 'Konto erforderlich',
    it: 'Serve un account',
    es: 'Se necesita cuenta',
  );
  String get syncNow => _t(
    'Szinkronizálás most',
    en: 'Sync now',
    de: 'Jetzt synchronisieren',
    it: 'Sincronizza ora',
    es: 'Sincronizar ahora',
  );
  String get syncOk => _t(
    'A kártyák szinkronban vannak.',
    en: 'Cards are in sync.',
    de: 'Karten sind synchron.',
    it: 'Le carte sono sincronizzate.',
    es: 'Las tarjetas están sincronizadas.',
  );
  String get syncLoginFirst => _t(
    'Előbb lépj be.',
    en: 'Sign in first.',
    de: 'Bitte zuerst anmelden.',
    it: 'Prima accedi.',
    es: 'Primero inicia sesión.',
  );
  String get aboutTagline => _t(
    'Offline-first tanuló füzet',
    en: 'Offline-first study notebook',
    de: 'Offline-first Lernheft',
    it: 'Quaderno di studio offline-first',
    es: 'Cuaderno de estudio offline-first',
  );
  String get aboutBody => _t(
    'Helyi kártyák, opcionális fiók, Tanterem a felhőben.',
    en: 'Local cards, optional account, Classroom in the cloud.',
    de: 'Lokale Karten, optionales Konto, Klassenraum in der Cloud.',
    it: 'Carte locali, account opzionale, Classe nel cloud.',
    es: 'Tarjetas locales, cuenta opcional, Aula en la nube.',
  );
  String get aboutFeatures => _t(
    'Amire képes',
    en: 'What it does',
    de: 'Funktionen',
    it: 'Funzionalità',
    es: 'Funciones',
  );
  String get aboutF1 => _t(
    'Tanulókártyák FSRS memóriagörbével',
    en: 'Flashcards with FSRS spaced repetition',
    de: 'Lernkarten mit FSRS-Wiederholung',
    it: 'Schede con ripasso FSRS',
    es: 'Fichas con repaso FSRS',
  );
  String get aboutF2 => _t(
    'Témakörök leckékkel és feladatokkal',
    en: 'Topics with lessons and exercises',
    de: 'Themen mit Lektionen und Aufgaben',
    it: 'Argomenti con lezioni ed esercizi',
    es: 'Temas con lecciones y ejercicios',
  );
  String get aboutF3 => _t(
    'Tanterem élő dogákkal',
    en: 'Classroom with live quizzes',
    de: 'Klassenraum mit Live-Quiz',
    it: 'Classe con verifiche dal vivo',
    es: 'Aula con pruebas en vivo',
  );
  String get aboutF4 => _t(
    'Offline működés és napi emlékeztető',
    en: 'Offline mode and daily reminders',
    de: 'Offline-Modus und tägliche Erinnerung',
    it: 'Modalità offline e promemoria giornaliero',
    es: 'Modo sin conexión y recordatorio diario',
  );
  String get aboutF5 => _t(
    'Ötnyelvű felület',
    en: 'Interface in five languages',
    de: 'Oberfläche in fünf Sprachen',
    it: 'Interfaccia in cinque lingue',
    es: 'Interfaz en cinco idiomas',
  );
  String get aboutVersion => _t(
    'Verzió: 1.0.0',
    en: 'Version: 1.0.0',
    de: 'Version: 1.0.0',
    it: 'Versione: 1.0.0',
    es: 'Versión: 1.0.0',
  );
  String get startPractice => _t(
    'Gyakorlás kezdése',
    en: 'Start practice',
    de: 'Üben starten',
    it: 'Inizia a esercitarti',
    es: 'Empezar a practicar',
  );
  String get nextPack => _t(
    'Következő csomag',
    en: 'Next pack',
    de: 'Nächstes Paket',
    it: 'Prossimo pacchetto',
    es: 'Siguiente paquete',
  );

  String get accountSubtitle => _t(
    'Nem kötelező. A Tanteremhez kell belépni.',
    en: 'Optional. Sign in is required for Classroom.',
    de: 'Freiwillig. Für den Klassenraum musst du dich anmelden.',
    it: 'Facoltativo. Per la Classe serve l’accesso.',
    es: 'Opcional. El Aula requiere iniciar sesión.',
  );
  String get name => _t(
    'Teljes név',
    en: 'Full name',
    de: 'Vollständiger Name',
    it: 'Nome completo',
    es: 'Nombre completo',
  );
  String get email =>
      _t('Email', en: 'Email', de: 'E-Mail', it: 'Email', es: 'Correo');
  String get password => _t(
    'Jelszó (min. 8)',
    en: 'Password (min. 8)',
    de: 'Passwort (mind. 8)',
    it: 'Password (min. 8)',
    es: 'Contraseña (mín. 8)',
  );
  String get register => _t(
    'Regisztráció',
    en: 'Register',
    de: 'Registrieren',
    it: 'Registrati',
    es: 'Registrarse',
  );
  String get emailOptional =>
      _t('Email', en: 'Email', de: 'E-Mail', it: 'Email', es: 'Correo');
  String get saveEmail => _t(
    'Email mentése',
    en: 'Save email',
    de: 'E-Mail speichern',
    it: 'Salva email',
    es: 'Guardar correo',
  );
  String get currentPassword => _t(
    'Jelenlegi jelszó',
    en: 'Current password',
    de: 'Aktuelles Passwort',
    it: 'Password attuale',
    es: 'Contraseña actual',
  );
  String get newPassword => _t(
    'Új jelszó (min. 8)',
    en: 'New password (min. 8)',
    de: 'Neues Passwort (mind. 8)',
    it: 'Nuova password (min. 8)',
    es: 'Nueva contraseña (mín. 8)',
  );
  String get saveProfile => _t(
    'Profil mentése',
    en: 'Save profile',
    de: 'Profil speichern',
    it: 'Salva profilo',
    es: 'Guardar perfil',
  );
  String get iAmTeacher => _t(
    'Tanár vagyok',
    en: 'I am a teacher',
    de: 'Ich bin Lehrkraft',
    it: 'Sono insegnante',
    es: 'Soy docente',
  );
  String get iAmTeacherHint => _t(
    'Publikálás és osztály létrehozása.',
    en: 'Publish and create classes.',
    de: 'Veröffentlichen und Klassen anlegen.',
    it: 'Pubblica e crea classi.',
    es: 'Publicar y crear clases.',
  );
  String get changePassword => _t(
    'Jelszó csere',
    en: 'Change password',
    de: 'Passwort ändern',
    it: 'Cambia password',
    es: 'Cambiar contraseña',
  );
  String get passwordChanged => _t(
    'A jelszavad megvan cserélve.',
    en: 'Your password is changed.',
    de: 'Dein Passwort ist geändert.',
    it: 'La password è cambiata.',
    es: 'Tu contraseña está cambiada.',
  );
  String get profileSaved => _t(
    'A profilod el van mentve.',
    en: 'Your profile is saved.',
    de: 'Dein Profil ist gespeichert.',
    it: 'Il profilo è salvato.',
    es: 'Tu perfil está guardado.',
  );
  String get reminderOff =>
      _t('Ki', en: 'Off', de: 'Aus', it: 'Off', es: 'Apagado');
  String get logout =>
      _t('Kilépés', en: 'Sign out', de: 'Abmelden', it: 'Esci', es: 'Salir');
  String get apiUrl => _t(
    'Szerver címe',
    en: 'Server address',
    de: 'Serveradresse',
    it: 'Indirizzo del server',
    es: 'Dirección del servidor',
  );
  String get apiUrlHint => _t(
    'Emulátor: 10.0.2.2 · USB: 127.0.0.1 (adb reverse) · Wi‑Fi: a géped LAN-címe, port 8787.',
    en: 'Emulator: 10.0.2.2 · USB: 127.0.0.1 (adb reverse) · Wi‑Fi: your computer’s LAN IP, port 8787.',
    de: 'Emulator: 10.0.2.2 · USB: 127.0.0.1 (adb reverse) · WLAN: LAN-IP deines Rechners, Port 8787.',
    it: 'Emulatore: 10.0.2.2 · USB: 127.0.0.1 (adb reverse) · Wi‑Fi: IP LAN del computer, porta 8787.',
    es: 'Emulador: 10.0.2.2 · USB: 127.0.0.1 (adb reverse) · Wi‑Fi: IP LAN de tu PC, puerto 8787.',
  );
  String get testConnection => _t(
    'Kapcsolat tesztelése',
    en: 'Test connection',
    de: 'Verbindung testen',
    it: 'Prova connessione',
    es: 'Probar conexión',
  );
  String get connectionOk => _t(
    'A Leardy elérte a szervert.',
    en: 'Leardy reached the server.',
    de: 'Leardy hat den Server erreicht.',
    it: 'Leardy ha raggiunto il server.',
    es: 'Leardy alcanzó el servidor.',
  );
  String get serverUnreachable => _t(
    'A Leardy nem érte el a szervert.',
    en: 'Leardy could not reach the server.',
    de: 'Leardy hat den Server nicht erreicht.',
    it: 'Leardy non ha raggiunto il server.',
    es: 'Leardy no pudo alcanzar el servidor.',
  );
  String get usernameTaken => _t(
    'Ez a név már foglalt.',
    en: 'This name is taken.',
    de: 'Dieser Name ist vergeben.',
    it: 'Questo nome è già usato.',
    es: 'Este nombre ya está en uso.',
  );
  String get emailTaken => _t(
    'Ez az email már foglalt.',
    en: 'This email is taken.',
    de: 'Diese E-Mail ist vergeben.',
    it: 'Questa email è già usata.',
    es: 'Este correo ya está en uso.',
  );
  String get invalidCreds => _t(
    'Hibás email vagy jelszó.',
    en: 'Wrong email or password.',
    de: 'Falsche E-Mail oder Passwort.',
    it: 'Email o password errati.',
    es: 'Correo o contraseña incorrectos.',
  );
  String get usernameRules => _t(
    'Add meg a teljes neved (2–64 karakter).',
    en: 'Enter your full name (2–64 characters).',
    de: 'Gib deinen vollen Namen ein (2–64 Zeichen).',
    it: 'Inserisci il nome completo (2–64 caratteri).',
    es: 'Escribe tu nombre completo (2–64 caracteres).',
  );
  String get passwordShort => _t(
    'A jelszó legalább 8 karakter.',
    en: 'Password must be at least 8 characters.',
    de: 'Das Passwort braucht mindestens 8 Zeichen.',
    it: 'La password deve avere almeno 8 caratteri.',
    es: 'La contraseña debe tener al menos 8 caracteres.',
  );
  String get invalidEmail => _t(
    'Érvénytelen email.',
    en: 'Invalid email.',
    de: 'Ungültige E-Mail.',
    it: 'Email non valida.',
    es: 'Correo no válido.',
  );
  String get unauthorized => _t(
    'A munkamenet lejárt. Lépj be újra.',
    en: 'Session expired. Sign in again.',
    de: 'Sitzung abgelaufen. Bitte neu anmelden.',
    it: 'Sessione scaduta. Accedi di nuovo.',
    es: 'La sesión caducó. Vuelve a entrar.',
  );
  String get notFound => _t(
    'Nem található.',
    en: 'Not found.',
    de: 'Nicht gefunden.',
    it: 'Non trovato.',
    es: 'No encontrado.',
  );
  String get invalidRequest => _t(
    'Érvénytelen kérés.',
    en: 'Invalid request.',
    de: 'Ungültige Anfrage.',
    it: 'Richiesta non valida.',
    es: 'Solicitud no válida.',
  );

  String apiError(String raw) {
    return switch (raw) {
      'server_unreachable' => serverUnreachable,
      'Username already taken' => usernameTaken,
      'Email already taken' => emailTaken,
      'Invalid username or password' => invalidCreds,
      'Current password is wrong' => _t(
        'A jelenlegi jelszó hibás.',
        en: 'The current password is wrong.',
        de: 'Das aktuelle Passwort ist falsch.',
        it: 'La password attuale è sbagliata.',
        es: 'La contraseña actual es incorrecta.',
      ),
      'Username must be 3-32 characters: letters, numbers, . _ -' =>
        usernameRules,
      'Name must be 2-64 characters' => usernameRules,
      'Password must be at least 8 characters' => passwordShort,
      'Invalid email' => invalidEmail,
      'Unauthorized' => unauthorized,
      'Not found' => notFound,
      'Invalid JSON' => invalidRequest,
      'changes array is required' => invalidRequest,
      'Too many requests' => _t(
        'Túl sok próbálkozás. Várj egy percet.',
        en: 'Too many attempts. Wait a minute.',
        de: 'Zu viele Versuche. Warte eine Minute.',
        it: 'Troppi tentativi. Attendi un minuto.',
        es: 'Demasiados intentos. Espera un minuto.',
      ),
      'Internal Server Error' => _t(
        'A szerver hibát jelzett.',
        en: 'The server reported an error.',
        de: 'Der Server hat einen Fehler gemeldet.',
        it: 'Il server ha segnalato un errore.',
        es: 'El servidor indicó un error.',
      ),
      'Could not save the cards' => _t(
        'A kártyákat nem sikerült elmenteni.',
        en: 'Could not save the cards.',
        de: 'Karten konnten nicht gespeichert werden.',
        it: 'Impossibile salvare le carte.',
        es: 'No se pudieron guardar las tarjetas.',
      ),
      'Set has no cards' => _t(
        'Ebben a szettben nincs kártya.',
        en: 'This set has no cards.',
        de: 'Dieser Stapel hat keine Karten.',
        it: 'Questo mazzo non ha carte.',
        es: 'Este mazo no tiene tarjetas.',
      ),
      'You are banned from this class' => _t(
        'Ki vagy tiltva ebből az osztályból.',
        en: 'You are banned from this class.',
        de: 'Du bist aus dieser Klasse ausgeschlossen.',
        it: 'Sei stato escluso da questa classe.',
        es: 'Estás expulsado de esta clase.',
      ),
      'Cannot remove the class owner' => _t(
        'Az osztály tulajdonosát nem lehet eltávolítani.',
        en: 'The class owner cannot be removed.',
        de: 'Der Klasseninhaber kann nicht entfernt werden.',
        it: 'Il titolare della classe non può essere rimosso.',
        es: 'No se puede quitar al dueño de la clase.',
      ),
      'Cannot ban the class owner' => _t(
        'Az osztály tulajdonosát nem lehet kitiltani.',
        en: 'The class owner cannot be banned.',
        de: 'Der Klasseninhaber kann nicht ausgeschlossen werden.',
        it: 'Il titolare della classe non può essere escluso.',
        es: 'No se puede expulsar al dueño de la clase.',
      ),
      'You cannot remove yourself' => _t(
        'Saját magadat nem dobhatod ki.',
        en: 'You cannot remove yourself.',
        de: 'Du kannst dich nicht selbst entfernen.',
        it: 'Non puoi rimuovere te stesso.',
        es: 'No puedes quitarte a ti mismo.',
      ),
      'You cannot ban yourself' => _t(
        'Saját magadat nem tilthatod ki.',
        en: 'You cannot ban yourself.',
        de: 'Du kannst dich nicht selbst ausschließen.',
        it: 'Non puoi escludere te stesso.',
        es: 'No puedes expulsarte a ti mismo.',
      ),
      'Only the owner can remove a teacher' => _t(
        'Tanárt csak a tulajdonos dobhat ki.',
        en: 'Only the owner can remove a teacher.',
        de: 'Nur der Inhaber kann eine Lehrkraft entfernen.',
        it: 'Solo il titolare può rimuovere un insegnante.',
        es: 'Solo el dueño puede quitar a un profesor.',
      ),
      'Only the owner can ban a teacher' => _t(
        'Tanárt csak a tulajdonos tilthat ki.',
        en: 'Only the owner can ban a teacher.',
        de: 'Nur der Inhaber kann eine Lehrkraft ausschließen.',
        it: 'Solo il titolare può escludere un insegnante.',
        es: 'Solo el dueño puede expulsar a un profesor.',
      ),
      'Only the owner can change roles' => _t(
        'A szerepet csak a tulajdonos módosíthatja.',
        en: 'Only the owner can change roles.',
        de: 'Nur der Inhaber kann Rollen ändern.',
        it: 'Solo il titolare può cambiare i ruoli.',
        es: 'Solo el dueño puede cambiar roles.',
      ),
      'Cannot change the class owner' => _t(
        'A tulajdonos szerepét nem lehet módosítani.',
        en: 'The class owner’s role cannot be changed.',
        de: 'Die Rolle des Inhabers kann nicht geändert werden.',
        it: 'Il ruolo del titolare non può essere cambiato.',
        es: 'No se puede cambiar el rol del dueño.',
      ),
      'Member not found' => _t(
        'Ez a diák már nincs az osztályban.',
        en: 'This student is no longer in the class.',
        de: 'Dieser Schüler ist nicht mehr in der Klasse.',
        it: 'Questo studente non è più nella classe.',
        es: 'Este alumno ya no está en la clase.',
      ),
      'Students cannot share materials in this class' => _t(
        'Ebben az osztályban a diákok nem oszthatnak meg anyagot.',
        en: 'Students cannot share materials in this class.',
        de: 'Schüler dürfen in dieser Klasse keine Materialien teilen.',
        it: 'In questa classe gli studenti non possono condividere materiali.',
        es: 'En esta clase los alumnos no pueden compartir materiales.',
      ),
      'Title is required' => _t(
        'A cím kötelező.',
        en: 'A title is required.',
        de: 'Ein Titel ist nötig.',
        it: 'Il titolo è obbligatorio.',
        es: 'El título es obligatorio.',
      ),
      'Invalid URL' => _t(
        'Érvénytelen link.',
        en: 'Invalid link.',
        de: 'Ungültiger Link.',
        it: 'Link non valido.',
        es: 'Enlace no válido.',
      ),
      'Add a link or a note' => _t(
        'Adj meg egy linket vagy egy jegyzetet.',
        en: 'Add a link or a note.',
        de: 'Füge einen Link oder eine Notiz hinzu.',
        it: 'Aggiungi un link o una nota.',
        es: 'Añade un enlace o una nota.',
      ),
      'Material not found' => _t(
        'Az anyag nem található.',
        en: 'Material not found.',
        de: 'Material nicht gefunden.',
        it: 'Materiale non trovato.',
        es: 'Material no encontrado.',
      ),
      'Only the owner can add editors' => _t(
        'Szerkesztőt csak a tulajdonos adhat hozzá.',
        en: 'Only the owner can add editors.',
        de: 'Nur der Inhaber kann Bearbeiter hinzufügen.',
        it: 'Solo il titolare può aggiungere editori.',
        es: 'Solo el dueño puede añadir editores.',
      ),
      'Only the owner can remove editors' => _t(
        'Szerkesztőt csak a tulajdonos vehet le.',
        en: 'Only the owner can remove editors.',
        de: 'Nur der Inhaber kann Bearbeiter entfernen.',
        it: 'Solo il titolare può rimuovere editori.',
        es: 'Solo el dueño puede quitar editores.',
      ),
      'Editor must be in the class' => _t(
        'A szerkesztőnek az osztály tagjának kell lennie.',
        en: 'The editor must be in the class.',
        de: 'Der Bearbeiter muss in der Klasse sein.',
        it: 'L’editor deve essere nella classe.',
        es: 'El editor debe estar en la clase.',
      ),
      'User not found' => _t(
        'Nincs ilyen fiók ezzel az emaillel.',
        en: 'No account with this email.',
        de: 'Kein Konto mit dieser E-Mail.',
        it: 'Nessun account con questa email.',
        es: 'No hay cuenta con este correo.',
      ),
      'The owner is already the owner' => _t(
        'A tulajdonos már tulajdonos.',
        en: 'The owner is already the owner.',
        de: 'Der Inhaber ist schon Inhaber.',
        it: 'Il titolare è già titolare.',
        es: 'El dueño ya es el dueño.',
      ),
      'Owner or teacher only' => _t(
        'Csak a tulajdonos vagy a tanár.',
        en: 'Owner or teacher only.',
        de: 'Nur Inhaber oder Lehrkraft.',
        it: 'Solo titolare o insegnante.',
        es: 'Solo dueño o profesor.',
      ),
      _ => raw.contains('füzet') ? serverUnreachable : raw,
    };
  }

  String get join => _t(
    'Csatlakozás',
    en: 'Join',
    de: 'Beitreten',
    it: 'Unisciti',
    es: 'Unirse',
  );
  String get createClass =>
      _t('Létrehozás', en: 'Create', de: 'Erstellen', it: 'Crea', es: 'Crear');
  String get classSheet =>
      _t('Osztály', en: 'Class', de: 'Klasse', it: 'Classe', es: 'Clase');
  String get classSheetSubtitle => _t(
    'Nyiss egyet, vagy lépj be kóddal.',
    en: 'Create one, or join with a code.',
    de: 'Eine öffnen oder mit Code beitreten.',
    it: 'Aprine una o entra con un codice.',
    es: 'Crea una o únete con un código.',
  );
  String get newClassName => _t(
    'Új osztály neve',
    en: 'New class name',
    de: 'Name der neuen Klasse',
    it: 'Nome della nuova classe',
    es: 'Nombre de la nueva clase',
  );
  String get openClass => _t(
    'Osztály létrehozása',
    en: 'Create class',
    de: 'Klasse erstellen',
    it: 'Crea classe',
    es: 'Crear clase',
  );
  String get joinCode => _t(
    'Csatlakozási kód',
    en: 'Join code',
    de: 'Beitrittscode',
    it: 'Codice di accesso',
    es: 'Código de acceso',
  );
  String get teacher => _t(
    'Tanár',
    en: 'Teacher',
    de: 'Lehrkraft',
    it: 'Insegnante',
    es: 'Profesor',
  );
  String get student => _t(
    'Diák',
    en: 'Student',
    de: 'Schüler',
    it: 'Studente',
    es: 'Estudiante',
  );
  String people(int n) => _t(
    '$n fő',
    en: '$n people',
    de: '$n Personen',
    it: '$n persone',
    es: '$n personas',
  );
  String get uploadSet => _t(
    'Szett feltöltése',
    en: 'Upload deck',
    de: 'Stapel hochladen',
    it: 'Carica mazzo',
    es: 'Subir mazo',
  );
  String get studentsCanPublish => _t(
    'Diákok publikálhatnak',
    en: 'Students can publish',
    de: 'Schüler dürfen veröffentlichen',
    it: 'Gli studenti possono pubblicare',
    es: 'Los alumnos pueden publicar',
  );
  String get studentsCanPublishHint => _t(
    'Ha be van kapcsolva, a diákok is feltölthetnek szettet és anyagot.',
    en: 'When on, students can upload decks and materials.',
    de: 'Wenn aktiv, dürfen Schüler Stapel und Materialien hochladen.',
    it: 'Se attivo, gli studenti possono caricare mazzi e materiali.',
    es: 'Si está activo, los alumnos pueden subir mazos y materiales.',
  );
  String get classSettings => _t(
    'Osztály beállításai',
    en: 'Class settings',
    de: 'Klasseneinstellungen',
    it: 'Impostazioni classe',
    es: 'Ajustes de la clase',
  );
  String get members => _t(
    'Diákok',
    en: 'Members',
    de: 'Mitglieder',
    it: 'Membri',
    es: 'Miembros',
  );
  String get banned => _t(
    'Kitiltottak',
    en: 'Banned',
    de: 'Gesperrt',
    it: 'Esclusi',
    es: 'Expulsados',
  );
  String get noMembers => _t(
    'Még nincs diák.',
    en: 'No students yet.',
    de: 'Noch keine Schüler.',
    it: 'Nessuno studente.',
    es: 'Aún no hay alumnos.',
  );
  String get kick =>
      _t('Kidobás', en: 'Remove', de: 'Entfernen', it: 'Rimuovi', es: 'Quitar');
  String get ban => _t(
    'Kitiltás',
    en: 'Ban',
    de: 'Ausschließen',
    it: 'Escludi',
    es: 'Expulsar',
  );
  String get unban => _t(
    'Tiltás feloldása',
    en: 'Unban',
    de: 'Sperre aufheben',
    it: 'Riammetti',
    es: 'Readmitir',
  );
  String get makeTeacher => _t(
    'Tanárrá tétel',
    en: 'Make teacher',
    de: 'Zur Lehrkraft machen',
    it: 'Rendi insegnante',
    es: 'Hacer profesor',
  );
  String get makeStudent => _t(
    'Diákká tétel',
    en: 'Make student',
    de: 'Zum Schüler machen',
    it: 'Rendi studente',
    es: 'Hacer alumno',
  );
  String get owner =>
      _t('Tulajdonos', en: 'Owner', de: 'Inhaber', it: 'Titolare', es: 'Dueño');
  String get copyCode => _t(
    'Kód másolása',
    en: 'Copy code',
    de: 'Code kopieren',
    it: 'Copia codice',
    es: 'Copiar código',
  );
  String get codeCopied => _t(
    'A kód a vágólapra került.',
    en: 'Code copied.',
    de: 'Code kopiert.',
    it: 'Codice copiato.',
    es: 'Código copiado.',
  );
  String get sharedSets => _t(
    'Megosztott szettek',
    en: 'Shared decks',
    de: 'Geteilte Stapel',
    it: 'Mazzi condivisi',
    es: 'Mazos compartidos',
  );
  String get noSharedSets => _t(
    'Még nincs közös szett.',
    en: 'No shared decks yet.',
    de: 'Noch keine gemeinsamen Stapel.',
    it: 'Nessun mazzo condiviso.',
    es: 'Aún no hay mazos compartidos.',
  );
  String get materials => _t(
    'Üzenetek',
    en: 'Messages',
    de: 'Nachrichten',
    it: 'Messaggi',
    es: 'Mensajes',
  );
  String get noMaterials => _t(
    'Még nincs üzenet.',
    en: 'No messages yet.',
    de: 'Noch keine Nachrichten.',
    it: 'Nessun messaggio.',
    es: 'Aún no hay mensajes.',
  );
  String get addMaterial => _t(
    'Üzenet',
    en: 'Message',
    de: 'Nachricht',
    it: 'Messaggio',
    es: 'Mensaje',
  );
  String get materialTitle =>
      _t('Cím', en: 'Title', de: 'Titel', it: 'Titolo', es: 'Título');
  String get materialUrl =>
      _t('Link', en: 'Link', de: 'Link', it: 'Link', es: 'Enlace');
  String get materialNote => _t(
    'Üzenet',
    en: 'Message',
    de: 'Nachricht',
    it: 'Messaggio',
    es: 'Mensaje',
  );
  String get deleteMaterial => _t(
    'Üzenet törlése',
    en: 'Delete message',
    de: 'Nachricht löschen',
    it: 'Elimina messaggio',
    es: 'Eliminar mensaje',
  );
  String get share => _t(
    'Megosztás',
    en: 'Share',
    de: 'Teilen',
    it: 'Condividi',
    es: 'Compartir',
  );
  String get openLink =>
      _t('Megnyitás', en: 'Open', de: 'Öffnen', it: 'Apri', es: 'Abrir');
  String get save =>
      _t('Mentés', en: 'Save', de: 'Speichern', it: 'Salva', es: 'Guardar');
  String get toastSaved => _t(
    'Sikeres mentés',
    en: 'Saved',
    de: 'Gespeichert',
    it: 'Salvato',
    es: 'Guardado',
  );
  String get toastShared => _t(
    'Sikeresen megosztva',
    en: 'Shared',
    de: 'Geteilt',
    it: 'Condiviso',
    es: 'Compartido',
  );
  String get toastPublished => _t(
    'Publikálva',
    en: 'Published',
    de: 'Veröffentlicht',
    it: 'Pubblicato',
    es: 'Publicado',
  );
  String get toastAdded => _t(
    'Felvéve',
    en: 'Added',
    de: 'Hinzugefügt',
    it: 'Aggiunto',
    es: 'Añadido',
  );
  String get toastCopied =>
      _t('Másolva', en: 'Copied', de: 'Kopiert', it: 'Copiato', es: 'Copiado');
  String get toastDeleted => _t(
    'Törölve',
    en: 'Deleted',
    de: 'Gelöscht',
    it: 'Eliminato',
    es: 'Eliminado',
  );
  String get toastCreated => _t(
    'Létrehozva',
    en: 'Created',
    de: 'Erstellt',
    it: 'Creato',
    es: 'Creado',
  );
  String codeLabel(String code) => _t(
    'Kód: $code',
    en: 'Code: $code',
    de: 'Code: $code',
    it: 'Codice: $code',
    es: 'Código: $code',
  );
  String get refresh => _t(
    'Frissítés',
    en: 'Refresh',
    de: 'Aktualisieren',
    it: 'Aggiorna',
    es: 'Actualizar',
  );
  String get startQuiz => _t(
    'Doga indítása',
    en: 'Start quiz',
    de: 'Quiz starten',
    it: 'Avvia verifica',
    es: 'Empezar prueba',
  );
  String get quiz =>
      _t('Doga', en: 'Quiz', de: 'Quiz', it: 'Verifica', es: 'Prueba');
  String get waiting => _t(
    'Várakozás a többiekre…',
    en: 'Waiting for others…',
    de: 'Warten auf die anderen…',
    it: 'In attesa degli altri…',
    es: 'Esperando a los demás…',
  );
  String get quizOver => _t(
    'A doga a végére ért.',
    en: 'The quiz is over.',
    de: 'Das Quiz ist vorbei.',
    it: 'La verifica è finita.',
    es: 'La prueba ha terminado.',
  );
  String quizPoints(int n) => _t(
    '$n pont',
    en: '$n points',
    de: '$n Punkte',
    it: '$n punti',
    es: '$n puntos',
  );
  String secondsLeft(int n) => _t(
    '$n mp',
    en: '${n}s',
    de: '$n s',
    it: '$n s',
    es: '$n s',
  );
  String get controls => _t(
    'Irányítás',
    en: 'Controls',
    de: 'Steuerung',
    it: 'Controlli',
    es: 'Controles',
  );
  String get quizStart =>
      _t('Indítás', en: 'Start', de: 'Start', it: 'Avvia', es: 'Empezar');
  String get nextQuestion => _t(
    'Következő kérdés',
    en: 'Next question',
    de: 'Nächste Frage',
    it: 'Domanda successiva',
    es: 'Siguiente pregunta',
  );
  String get closeQuestion =>
      _t('Lezárás', en: 'Close', de: 'Schließen', it: 'Chiudi', es: 'Cerrar');
  String get results => _t(
    'Eredmény',
    en: 'Results',
    de: 'Ergebnis',
    it: 'Risultati',
    es: 'Resultados',
  );
  String get quizEnd =>
      _t('Vége', en: 'End', de: 'Ende', it: 'Fine', es: 'Fin');
  String get quizLive => _t(
    'Doga folyamatban',
    en: 'Quiz in progress',
    de: 'Quiz läuft',
    it: 'Verifica in corso',
    es: 'Prueba en curso',
  );
  String get quizJoin => _t(
    'Belépés a dogába',
    en: 'Join the quiz',
    de: 'Am Quiz teilnehmen',
    it: 'Entra nella verifica',
    es: 'Entrar a la prueba',
  );
  String get quizHost => _t(
    'Irányítópult',
    en: 'Host view',
    de: 'Lehrkraft-Ansicht',
    it: 'Vista docente',
    es: 'Vista del profesor',
  );
  String get quizPause =>
      _t('Szünet', en: 'Pause', de: 'Pause', it: 'Pausa', es: 'Pausa');
  String get quizResume =>
      _t('Folytatás', en: 'Resume', de: 'Weiter', it: 'Riprendi', es: 'Seguir');
  String get quizNext =>
      _t('Tovább', en: 'Next', de: 'Weiter', it: 'Avanti', es: 'Siguiente');
  String answeredCount(int answered, int total) => _t(
    '$answered / $total válaszolt',
    en: '$answered / $total answered',
    de: '$answered / $total geantwortet',
    it: '$answered / $total hanno risposto',
    es: '$answered / $total respondieron',
  );
  String get waitingToAnswer => _t(
    'Még nem mindenki válaszolt.',
    en: 'Not everyone has answered yet.',
    de: 'Noch nicht alle haben geantwortet.',
    it: 'Non tutti hanno ancora risposto.',
    es: 'Aún no han respondido todos.',
  );
  String get waitingShort =>
      _t('Vár', en: 'Wait', de: 'Wartet', it: 'Attende', es: 'Espera');
  String get quizInvite => _t(
    'Új doga indult',
    en: 'A quiz has started',
    de: 'Ein Quiz hat begonnen',
    it: 'È iniziata una verifica',
    es: 'Ha empezado una prueba',
  );
  String get quizPace =>
      _t('Léptetés', en: 'Pacing', de: 'Tempo', it: 'Avanzamento', es: 'Ritmo');
  String get quizPaceTeacher => _t(
    'Tanár léptet',
    en: 'Teacher advances',
    de: 'Lehrkraft steuert',
    it: 'Avanza l’insegnante',
    es: 'Avanza el profesor',
  );
  String get quizPaceTimed => _t(
    'Fix idő kérdésenként',
    en: 'Fixed time per question',
    de: 'Feste Zeit pro Frage',
    it: 'Tempo fisso per domanda',
    es: 'Tiempo fijo por pregunta',
  );
  String get quizPaceAuto => _t(
    'Automata',
    en: 'Automatic',
    de: 'Automatisch',
    it: 'Automatico',
    es: 'Automático',
  );
  String get quizSeconds => _t(
    'Másodperc kérdésenként',
    en: 'Seconds per question',
    de: 'Sekunden pro Frage',
    it: 'Secondi per domanda',
    es: 'Segundos por pregunta',
  );
  String get quizQuestionMode => _t(
    'Kérdéstípus',
    en: 'Question type',
    de: 'Fragetyp',
    it: 'Tipo di domanda',
    es: 'Tipo de pregunta',
  );
  String get quizModeChoice => _t(
    'Feleletválasztó',
    en: 'Multiple choice',
    de: 'Auswahl',
    it: 'Scelta multipla',
    es: 'Opción múltiple',
  );
  String get quizModeType => _t(
    'Beírós',
    en: 'Type the answer',
    de: 'Eintippen',
    it: 'Scrivi la risposta',
    es: 'Escribe la respuesta',
  );
  String get quizModeRandom =>
      _t('Vegyes', en: 'Random mix', de: 'Gemischt', it: 'Misto', es: 'Mezcla');
  String get yourAnswer => _t(
    'A válaszod',
    en: 'Your answer',
    de: 'Deine Antwort',
    it: 'La tua risposta',
    es: 'Tu respuesta',
  );
  String get submitAnswer =>
      _t('Beküldés', en: 'Submit', de: 'Senden', it: 'Invia', es: 'Enviar');

  String get mine =>
      _t('Saját', en: 'Mine', de: 'Meine', it: 'Miei', es: 'Míos');
  String get discover => _t(
    'Felfedezés',
    en: 'Discover',
    de: 'Entdecken',
    it: 'Scopri',
    es: 'Descubrir',
  );
  String get searchBundles =>
      _t('Keresés', en: 'Search', de: 'Suchen', it: 'Cerca', es: 'Buscar');
  String get searchCards => _t(
    'Keresés a kártyákban',
    en: 'Search cards',
    de: 'Karten suchen',
    it: 'Cerca nelle carte',
    es: 'Buscar en tarjetas',
  );
  String get searchCardsHint => _t(
    'Írj be egy szót…',
    en: 'Type a word…',
    de: 'Wort eingeben…',
    it: 'Scrivi una parola…',
    es: 'Escribe una palabra…',
  );
  String get noCardsFound => _t(
    'Nincs ilyen kártya.',
    en: 'No matching cards.',
    de: 'Keine passenden Karten.',
    it: 'Nessuna carta trovata.',
    es: 'Sin tarjetas coincidentes.',
  );
  String masteryLabel(int p) => _t(
    'Megtanulva: $p%',
    en: 'Learned: $p%',
    de: 'Gelernt: $p%',
    it: 'Imparato: $p%',
    es: 'Aprendido: $p%',
  );
  String get levelZero => _t(
    'Még nem tudom',
    en: 'Not yet',
    de: 'Noch nicht',
    it: 'Ancora no',
    es: 'Aún no',
  );
  String get learn =>
      _t('Tanul', en: 'Learn', de: 'Lernen', it: 'Impara', es: 'Aprender');
  String get practiceNow => _t(
    'Gyakorol',
    en: 'Practice',
    de: 'Üben',
    it: 'Esercitati',
    es: 'Practicar',
  );
  String get practiceAfterLearn => _t(
    'Gyakorolom',
    en: 'Practice now',
    de: 'Jetzt üben',
    it: 'Esercitati ora',
    es: 'Practicar ahora',
  );
  String get addToLibrary => _t(
    'Felveszem',
    en: 'Add',
    de: 'Übernehmen',
    it: 'Aggiungi',
    es: 'Añadir',
  );
  String get removeFromLibrary => _t(
    'Eltávolítom',
    en: 'Remove',
    de: 'Entfernen',
    it: 'Rimuovi',
    es: 'Quitar',
  );
  String get addedToLibrary => _t(
    'A Sajátban van',
    en: 'In your library',
    de: 'In deiner Bibliothek',
    it: 'Nella libreria',
    es: 'En tu biblioteca',
  );
  String get topicKind =>
      _t('Témakör', en: 'Topic', de: 'Thema', it: 'Argomento', es: 'Tema');
  String get skillKind => _t(
    'Tanulókártya',
    en: 'Study cards',
    de: 'Lernkarten',
    it: 'Schede',
    es: 'Fichas',
  );
  String get myTopics => _t(
    'Témaköreim',
    en: 'My topics',
    de: 'Meine Themen',
    it: 'I miei argomenti',
    es: 'Mis temas',
  );
  String get myCardPacks => _t(
    'Tanulókártyáim',
    en: 'My study cards',
    de: 'Meine Lernkarten',
    it: 'Le mie schede',
    es: 'Mis fichas',
  );
  String get discoverTopics =>
      _t('Témakörök', en: 'Topics', de: 'Themen', it: 'Argomenti', es: 'Temas');
  String get discoverCardPacks => _t(
    'Tanulókártyák',
    en: 'Study cards',
    de: 'Lernkarten',
    it: 'Schede',
    es: 'Fichas',
  );
  String get filterBundles =>
      _t('Szűrés', en: 'Filter', de: 'Filtern', it: 'Filtra', es: 'Filtrar');
  String get filterKind =>
      _t('Típus', en: 'Type', de: 'Art', it: 'Tipo', es: 'Tipo');
  String get clearFilters => _t(
    'Szűrők törlése',
    en: 'Clear filters',
    de: 'Filter löschen',
    it: 'Cancella filtri',
    es: 'Quitar filtros',
  );
  String get backToMine => _t(
    'Vissza a Sajáthoz',
    en: 'Back to Mine',
    de: 'Zurück zu Meine',
    it: 'Torna ai Miei',
    es: 'Volver a Míos',
  );
  String get lessonsHeading => _t(
    'Leckék',
    en: 'Lessons',
    de: 'Lektionen',
    it: 'Lezioni',
    es: 'Lecciones',
  );
  String lessonIndex(int n) => _t(
    '$n. lecke',
    en: 'Lesson $n',
    de: 'Lektion $n',
    it: 'Lezione $n',
    es: 'Lección $n',
  );
  String get addLesson => _t(
    'Lecke hozzáadása',
    en: 'Add lesson',
    de: 'Lektion hinzufügen',
    it: 'Aggiungi lezione',
    es: 'Añadir lección',
  );
  String get removeLesson => _t(
    'Lecke eltávolítása',
    en: 'Remove lesson',
    de: 'Lektion entfernen',
    it: 'Rimuovi lezione',
    es: 'Quitar lección',
  );
  String get deleteLesson => _t(
    'Lecke törlése',
    en: 'Delete lesson',
    de: 'Lektion löschen',
    it: 'Elimina lezione',
    es: 'Eliminar lección',
  );
  String get editMode => _t(
    'Szerkesztés',
    en: 'Editing',
    de: 'Bearbeiten',
    it: 'Modifica',
    es: 'Edición',
  );
  String get doneEditing =>
      _t('Kész', en: 'Done', de: 'Fertig', it: 'Fatto', es: 'Listo');
  String get emptyTopicEdit => _t(
    'Adj hozzá egy leckét.',
    en: 'Add a lesson.',
    de: 'Füge eine Lektion hinzu.',
    it: 'Aggiungi una lezione.',
    es: 'Añade una lección.',
  );
  String get emptyStepsEdit => _t(
    'Adj hozzá egy lépést — a diák ezeken halad végig.',
    en: 'Add a step — students move through these.',
    de: 'Füge einen Schritt hinzu.',
    it: 'Aggiungi un passo.',
    es: 'Añade un paso.',
  );
  String get cancel =>
      _t('Mégse', en: 'Cancel', de: 'Abbrechen', it: 'Annulla', es: 'Cancelar');
  String get previewLesson => _t(
    'Előnézet',
    en: 'Preview',
    de: 'Vorschau',
    it: 'Anteprima',
    es: 'Vista previa',
  );
  String get addOption =>
      _t('Opció', en: 'Option', de: 'Option', it: 'Opzione', es: 'Opción');
  String get addPair =>
      _t('Pár', en: 'Pair', de: 'Paar', it: 'Coppia', es: 'Par');
  String get addOrderItem =>
      _t('Tétel', en: 'Item', de: 'Eintrag', it: 'Voce', es: 'Ítem');
  String get correctOption => _t(
    'Helyes',
    en: 'Correct',
    de: 'Richtig',
    it: 'Corretta',
    es: 'Correcta',
  );
  String get pairLeft =>
      _t('Bal', en: 'Left', de: 'Links', it: 'Sinistra', es: 'Izquierda');
  String get pairRight =>
      _t('Jobb', en: 'Right', de: 'Rechts', it: 'Destra', es: 'Derecha');
  String get savedStatus => _t(
    'Mentve',
    en: 'Saved',
    de: 'Gespeichert',
    it: 'Salvato',
    es: 'Guardado',
  );
  String get savingStatus => _t(
    'Mentés…',
    en: 'Saving…',
    de: 'Speichern…',
    it: 'Salvataggio…',
    es: 'Guardando…',
  );
  String get moveUp => _t('Fel', en: 'Up', de: 'Hoch', it: 'Su', es: 'Arriba');
  String get moveDown =>
      _t('Le', en: 'Down', de: 'Runter', it: 'Giù', es: 'Abajo');
  String editorCounts(int steps, int exercises) => _t(
    '$steps lépés · $exercises feladat',
    en: '$steps steps · $exercises exercises',
    de: '$steps Schritte · $exercises Aufgaben',
    it: '$steps passi · $exercises esercizi',
    es: '$steps pasos · $exercises ejercicios',
  );
  String get emptyTopic => _t(
    'Ebben a témakörben még nincs lecke.',
    en: 'This topic has no lessons yet.',
    de: 'Dieses Thema hat noch keine Lektionen.',
    it: 'Questo argomento non ha ancora lezioni.',
    es: 'Este tema aún no tiene lecciones.',
  );
  String get addStep =>
      _t('Lépés', en: 'Step', de: 'Schritt', it: 'Passo', es: 'Paso');
  String get deleteStep => _t(
    'Lépés törlése',
    en: 'Delete step',
    de: 'Schritt löschen',
    it: 'Elimina passo',
    es: 'Eliminar paso',
  );
  String get stepText =>
      _t('Szöveg', en: 'Text', de: 'Text', it: 'Testo', es: 'Texto');
  String get stepFact =>
      _t('Lényeg', en: 'Key point', de: 'Kern', it: 'Essenza', es: 'Clave');
  String get stepPrompt =>
      _t('Kérdés', en: 'Prompt', de: 'Frage', it: 'Domanda', es: 'Pregunta');
  String get stepSource =>
      _t('Forrás', en: 'Source', de: 'Quelle', it: 'Fonte', es: 'Fuente');
  String get stepAnswer => _t(
    'Válasz (opcionális)',
    en: 'Answer (optional)',
    de: 'Antwort (optional)',
    it: 'Risposta (opzionale)',
    es: 'Respuesta (opcional)',
  );
  String get formatBold =>
      _t('Félkövér', en: 'Bold', de: 'Fett', it: 'Grassetto', es: 'Negrita');
  String get formatItalic =>
      _t('Dőlt', en: 'Italic', de: 'Kursiv', it: 'Corsivo', es: 'Cursiva');
  String get formatList => _t(
    'Felsorolás',
    en: 'Bullet list',
    de: 'Aufzählung',
    it: 'Elenco puntato',
    es: 'Lista',
  );
  String get contentTab => _t(
    'Tartalom',
    en: 'Content',
    de: 'Inhalt',
    it: 'Contenuto',
    es: 'Contenido',
  );
  String get practiceTab => _t(
    'Gyakorlás',
    en: 'Practice',
    de: 'Übung',
    it: 'Esercizi',
    es: 'Práctica',
  );
  String get addExercise => _t(
    'Feladat',
    en: 'Exercise',
    de: 'Aufgabe',
    it: 'Esercizio',
    es: 'Ejercicio',
  );
  String get deleteExercise => _t(
    'Feladat törlése',
    en: 'Delete exercise',
    de: 'Aufgabe löschen',
    it: 'Elimina esercizio',
    es: 'Eliminar ejercicio',
  );
  String get emptyPractice => _t(
    'Ehhez a leckéhez még nincs feladat.',
    en: 'No exercises in this lesson yet.',
    de: 'Noch keine Aufgaben.',
    it: 'Ancora nessun esercizio.',
    es: 'Aún no hay ejercicios.',
  );
  String get emptyPracticeEdit => _t(
    'Adj hozzá egy feladatot.',
    en: 'Add an exercise.',
    de: 'Füge eine Aufgabe hinzu.',
    it: 'Aggiungi un esercizio.',
    es: 'Añade un ejercicio.',
  );
  String get retryPractice =>
      _t('Újra', en: 'Again', de: 'Nochmal', it: 'Di nuovo', es: 'Otra vez');
  String get retryWrong => _t(
    'Tévesztettek újra',
    en: 'Retry mistakes',
    de: 'Fehler wiederholen',
    it: 'Riprova gli errori',
    es: 'Reintentar los errores',
  );
  String get backToTopic => _t(
    'Vissza a témakörhöz',
    en: 'Back to topic',
    de: 'Zurück zum Thema',
    it: "Torna all'argomento",
    es: 'Volver al tema',
  );
  String get exerciseFlip =>
      _t('Kártya', en: 'Card', de: 'Karte', it: 'Carta', es: 'Ficha');
  String get exerciseChoice =>
      _t('Választós', en: 'Choice', de: 'Auswahl', it: 'Scelta', es: 'Opción');
  String get exerciseType =>
      _t('Beírós', en: 'Type', de: 'Tippen', it: 'Scrivi', es: 'Escribir');
  String get exerciseMatch => _t(
    'Párosító',
    en: 'Match',
    de: 'Zuordnen',
    it: 'Abbina',
    es: 'Emparejar',
  );
  String get exerciseOrder =>
      _t('Sorrend', en: 'Order', de: 'Reihenfolge', it: 'Ordine', es: 'Orden');
  String get choiceOptions => _t(
    'Rossz válaszok (soronként)',
    en: 'Wrong answers (one per line)',
    de: 'Falsche Antworten (je Zeile)',
    it: 'Risposte sbagliate (una per riga)',
    es: 'Respuestas incorrectas (una por línea)',
  );
  String get matchPairs => _t(
    'Párok (bal | jobb)',
    en: 'Pairs (left | right)',
    de: 'Paare (links | rechts)',
    it: 'Coppie (sinistra | destra)',
    es: 'Pares (izq | der)',
  );
  String get orderItems => _t(
    'Helyes sorrend (soronként)',
    en: 'Correct order (one per line)',
    de: 'Richtige Reihenfolge (je Zeile)',
    it: 'Ordine corretto (una per riga)',
    es: 'Orden correcto (una por línea)',
  );
  String get practiceCorrect => _t(
    'Helyes',
    en: 'Correct',
    de: 'Richtig',
    it: 'Corretto',
    es: 'Correcto',
  );
  String get practiceWrong => _t(
    'Nem ez',
    en: 'Not quite',
    de: 'Nicht ganz',
    it: 'Non proprio',
    es: 'Casi',
  );
  String get practiceScore =>
      _t('Kész', en: 'Done', de: 'Fertig', it: 'Fatto', es: 'Listo');
  String stepLabel(LessonStepType type) => switch (type) {
    LessonStepType.text => stepText,
    LessonStepType.fact => stepFact,
    LessonStepType.prompt => stepPrompt,
    LessonStepType.source => stepSource,
  };
  String exerciseLabel(LessonExerciseType type) => switch (type) {
    LessonExerciseType.flip => exerciseFlip,
    LessonExerciseType.choice => exerciseChoice,
    LessonExerciseType.type => exerciseType,
    LessonExerciseType.match => exerciseMatch,
    LessonExerciseType.order => exerciseOrder,
  };
  String get editLesson => _t(
    'Lecke szerkesztése',
    en: 'Edit lesson',
    de: 'Lektion bearbeiten',
    it: 'Modifica lezione',
    es: 'Editar lección',
  );
  String get editBundle => _t(
    'Szerkesztés',
    en: 'Edit',
    de: 'Bearbeiten',
    it: 'Modifica',
    es: 'Editar',
  );
  String get pickQuizSource => _t(
    'Miből indítsunk dogát?',
    en: 'Quiz from which lesson?',
    de: 'Quiz aus welcher Lektion?',
    it: 'Verifica da quale lezione?',
    es: '¿Prueba de qué lección?',
  );
  String get lessonTitle => _t(
    'Lecke címe',
    en: 'Lesson title',
    de: 'Lektionstitel',
    it: 'Titolo della lezione',
    es: 'Título de la lección',
  );
  String get nextLesson => _t(
    'Következő lecke',
    en: 'Next lesson',
    de: 'Nächste Lektion',
    it: 'Lezione successiva',
    es: 'Siguiente lección',
  );
  String get classWall =>
      _t('Főfal', en: 'Feed', de: 'Pinnwand', it: 'Bacheca', es: 'Muro');
  String get emptyWall => _t(
    'Még nincs megosztott bejegyzés.',
    en: 'No posts yet.',
    de: 'Noch keine Beiträge.',
    it: 'Nessun post.',
    es: 'Aún no hay publicaciones.',
  );
  String get renameClass => _t(
    'Osztály átnevezése',
    en: 'Rename class',
    de: 'Klasse umbenennen',
    it: 'Rinomina classe',
    es: 'Renombrar clase',
  );
  String get className => _t(
    'Osztály neve',
    en: 'Class name',
    de: 'Klassenname',
    it: 'Nome della classe',
    es: 'Nombre de la clase',
  );
  String get editMessage => _t(
    'Üzenet szerkesztése',
    en: 'Edit message',
    de: 'Nachricht bearbeiten',
    it: 'Modifica messaggio',
    es: 'Editar mensaje',
  );
  String get addMessage => _t(
    'Üzenet',
    en: 'Message',
    de: 'Nachricht',
    it: 'Messaggio',
    es: 'Mensaje',
  );
  String get deletePost => _t(
    'Törlés a főfalról',
    en: 'Remove from feed',
    de: 'Von der Pinnwand entfernen',
    it: 'Rimuovi dalla bacheca',
    es: 'Quitar del muro',
  );
  String get newBundle => _t(
    'Új csomag',
    en: 'New pack',
    de: 'Neues Paket',
    it: 'Nuovo pacchetto',
    es: 'Nuevo paquete',
  );
  String get bundleTitle =>
      _t('Cím', en: 'Title', de: 'Titel', it: 'Titolo', es: 'Título');
  String get lessonText => _t(
    'Lecke szövege',
    en: 'Lesson text',
    de: 'Lektionstext',
    it: 'Testo della lezione',
    es: 'Texto de la lección',
  );
  String get mapPlaces => _t(
    'Vaktérkép helyei (vesszővel)',
    en: 'Map places (comma-separated)',
    de: 'Kartenorte (kommagetrennt)',
    it: 'Luoghi della mappa (separati da virgola)',
    es: 'Lugares del mapa (separados por coma)',
  );
  String get publishBundle => _t(
    'Publikálás',
    en: 'Publish',
    de: 'Veröffentlichen',
    it: 'Pubblica',
    es: 'Publicar',
  );
  String get assignLesson => _t(
    'Lecke kiosztása',
    en: 'Assign lesson',
    de: 'Lektion zuweisen',
    it: 'Assegna lezione',
    es: 'Asignar lección',
  );
  String get assignedLessons => _t(
    'Kiosztott leckék',
    en: 'Assigned lessons',
    de: 'Zugewiesene Lektionen',
    it: 'Lezioni assegnate',
    es: 'Lecciones asignadas',
  );
  String get noAssignedLessons => _t(
    'Még nincs kiosztott lecke.',
    en: 'No assigned lessons yet.',
    de: 'Noch keine zugewiesenen Lektionen.',
    it: 'Nessuna lezione assegnata.',
    es: 'Aún no hay lecciones asignadas.',
  );
  String get noBundles => _t(
    'Itt még üres a lista.',
    en: 'Nothing here yet.',
    de: 'Hier ist noch nichts.',
    it: 'Qui è ancora vuoto.',
    es: 'Aquí aún no hay nada.',
  );
  String get continueLesson => _t(
    'Folytasd a leckét',
    en: 'Continue the lesson',
    de: 'Lektion fortsetzen',
    it: 'Continua la lezione',
    es: 'Continúa la lección',
  );
  String get lessonDone => _t(
    'Kész, gyakorlok',
    en: 'Done, practice',
    de: 'Fertig, üben',
    it: 'Fatto, esercitati',
    es: 'Listo, practicar',
  );
  String get nextPage =>
      _t('Tovább', en: 'Next', de: 'Weiter', it: 'Avanti', es: 'Siguiente');
  String get mapPractice => _t(
    'Vaktérkép',
    en: 'Blank map',
    de: 'Stumme Karte',
    it: 'Carta muta',
    es: 'Mapa mudo',
  );
  String get tapThePlace => _t(
    'Koppints a helyre',
    en: 'Tap the place',
    de: 'Tippe den Ort',
    it: 'Tocca il luogo',
    es: 'Toca el lugar',
  );
  String get typeThePlace => _t(
    'Írd be a nevét',
    en: 'Type the name',
    de: 'Namen eingeben',
    it: 'Scrivi il nome',
    es: 'Escribe el nombre',
  );
  String get mapCorrect => _t(
    'Talált',
    en: 'Found',
    de: 'Gefunden',
    it: 'Trovato',
    es: 'Encontrado',
  );
  String get mapMiss => _t(
    'Nem ez az',
    en: 'Not this one',
    de: 'Nicht dieser',
    it: 'Non è questo',
    es: 'No es este',
  );
  String get quizFromBundle => _t(
    'Doga ebből',
    en: 'Quiz from this',
    de: 'Quiz daraus',
    it: 'Verifica da questo',
    es: 'Prueba de esto',
  );
  String get pickClass => _t(
    'Válassz osztályt',
    en: 'Choose a class',
    de: 'Klasse wählen',
    it: 'Scegli una classe',
    es: 'Elige una clase',
  );
  String get cardsActivity =>
      _t('Kártyák', en: 'Cards', de: 'Karten', it: 'Carte', es: 'Tarjetas');
  String get draftStatus =>
      _t('Vázlat', en: 'Draft', de: 'Entwurf', it: 'Bozza', es: 'Borrador');
  String get publicStatus => _t(
    'Nyilvános',
    en: 'Public',
    de: 'Öffentlich',
    it: 'Pubblico',
    es: 'Público',
  );
  String bundleMeta(String kind, String subject) {
    if (subject.isEmpty) return kind;
    return '$kind · ${subjectLabel(subject)}';
  }

  String subjectLabel(String idOrName) {
    final needle = idOrName.trim().toLowerCase();
    String id = needle;
    if (needle == 'magyar nyelv') {
      id = 'nyelvtan';
    } else if (needle == 'hit- és erkölcstan') {
      id = 'hittan';
    } else if (needle == 'digitális kultúra') {
      id = 'digitalis-kultura';
    } else {
      const huNames = {
        'nyelvtan': 'nyelvtan',
        'angol': 'angol',
        'német': 'nemet',
        'olasz': 'olasz',
        'irodalom': 'irodalom',
        'történelem': 'tortenelem',
        'hittan': 'hittan',
        'matematika': 'matematika',
        'fizika': 'fizika',
        'kémia': 'kemia',
        'biológia': 'biologia',
        'földrajz': 'foldrajz',
        'természettudomány': 'termeszettudomany',
        'ének-zene': 'enek-zene',
        'testnevelés': 'testneveles',
        'egyéb': 'egyeb',
      };
      id = huNames[needle] ?? needle;
    }
    return switch (id) {
      'nyelvtan' => _t(
        'Nyelvtan',
        en: 'Grammar',
        de: 'Grammatik',
        it: 'Grammatica',
        es: 'Gramática',
      ),
      'angol' => _t(
        'Angol',
        en: 'English',
        de: 'Englisch',
        it: 'Inglese',
        es: 'Inglés',
      ),
      'nemet' => _t(
        'Német',
        en: 'German',
        de: 'Deutsch',
        it: 'Tedesco',
        es: 'Alemán',
      ),
      'olasz' => _t(
        'Olasz',
        en: 'Italian',
        de: 'Italienisch',
        it: 'Italiano',
        es: 'Italiano',
      ),
      'irodalom' => _t(
        'Irodalom',
        en: 'Literature',
        de: 'Literatur',
        it: 'Letteratura',
        es: 'Literatura',
      ),
      'tortenelem' => _t(
        'Történelem',
        en: 'History',
        de: 'Geschichte',
        it: 'Storia',
        es: 'Historia',
      ),
      'hittan' => _t(
        'Hittan',
        en: 'Religion',
        de: 'Religion',
        it: 'Religione',
        es: 'Religión',
      ),
      'matematika' => _t(
        'Matematika',
        en: 'Mathematics',
        de: 'Mathematik',
        it: 'Matematica',
        es: 'Matemáticas',
      ),
      'digitalis-kultura' => _t(
        'Digitális Kultúra',
        en: 'Digital Culture',
        de: 'Digitale Kultur',
        it: 'Cultura Digitale',
        es: 'Cultura Digital',
      ),
      'fizika' => _t(
        'Fizika',
        en: 'Physics',
        de: 'Physik',
        it: 'Fisica',
        es: 'Física',
      ),
      'kemia' => _t(
        'Kémia',
        en: 'Chemistry',
        de: 'Chemie',
        it: 'Chimica',
        es: 'Química',
      ),
      'biologia' => _t(
        'Biológia',
        en: 'Biology',
        de: 'Biologie',
        it: 'Biologia',
        es: 'Biología',
      ),
      'foldrajz' => _t(
        'Földrajz',
        en: 'Geography',
        de: 'Erdkunde',
        it: 'Geografia',
        es: 'Geografía',
      ),
      'termeszettudomany' => _t(
        'Természettudomány',
        en: 'Natural Science',
        de: 'Naturwissenschaft',
        it: 'Scienze Naturali',
        es: 'Ciencias Naturales',
      ),
      'enek-zene' => _t(
        'Ének-zene',
        en: 'Music',
        de: 'Musik',
        it: 'Musica',
        es: 'Música',
      ),
      'testneveles' => _t(
        'Testnevelés',
        en: 'Physical Education',
        de: 'Sport',
        it: 'Educazione Fisica',
        es: 'Educación Física',
      ),
      'egyeb' => _t(
        'Egyéb',
        en: 'Other',
        de: 'Sonstiges',
        it: 'Altro',
        es: 'Otros',
      ),
      _ => idOrName,
    };
  }

  String get unpublishBundle => _t(
    'Publikálás visszavonása',
    en: 'Unpublish',
    de: 'Veröffentlichung zurückziehen',
    it: 'Ritira pubblicazione',
    es: 'Retirar publicación',
  );
  String get unpublishHint => _t(
    'Visszavonás után törölheted. Akinél már mentve van, annál megmarad.',
    en: 'After unpublishing you can delete it. Saved copies stay.',
    de: 'Nach dem Zurückziehen kannst du löschen. Gespeicherte Kopien bleiben.',
    it: 'Dopo il ritiro puoi eliminarlo. Le copie salvate restano.',
    es: 'Tras retirarla puedes eliminarla. Las copias guardadas se quedan.',
  );
  String get cannotDeletePublished => _t(
    'Publikált csomagot előbb vissza kell vonni.',
    en: 'Unpublish a public pack before deleting it.',
    de: 'Ziehe die Veröffentlichung zurück, bevor du löschst.',
    it: 'Ritira la pubblicazione prima di eliminare.',
    es: 'Retira la publicación antes de eliminar.',
  );
  String correctIs(String answer) => _t(
    'Helyes: $answer',
    en: 'Correct: $answer',
    de: 'Richtig: $answer',
    it: 'Corretta: $answer',
    es: 'Correcta: $answer',
  );
  String get noTip => _t(
    'Nincs tipp',
    en: 'No hint',
    de: 'Kein Tipp',
    it: 'Nessun suggerimento',
    es: 'Sin pista',
  );
  String practiceResult(int correct, int total) => _t(
    '$correct / $total helyes',
    en: '$correct / $total correct',
    de: '$correct / $total richtig',
    it: '$correct / $total corrette',
    es: '$correct / $total correctas',
  );
  String get practicePercent => _t(
    'arány',
    en: 'score',
    de: 'Quote',
    it: 'punteggio',
    es: 'acierto',
  );
  String get practiceTime => _t(
    'idő',
    en: 'time',
    de: 'Zeit',
    it: 'tempo',
    es: 'tiempo',
  );
  String get backToCards => _t(
    'Vissza a kártyákhoz',
    en: 'Back to cards',
    de: 'Zurück zu den Karten',
    it: 'Torna alle carte',
    es: 'Volver a las tarjetas',
  );
  String get levelEasy => _t(
    'Könnyű',
    en: 'Easy',
    de: 'Leicht',
    it: 'Facile',
    es: 'Fácil',
  );
  String get levelMedium => _t(
    'Közepes',
    en: 'Medium',
    de: 'Mittel',
    it: 'Medio',
    es: 'Medio',
  );
  String get levelHard => _t(
    'Nehéz',
    en: 'Hard',
    de: 'Schwer',
    it: 'Difficile',
    es: 'Difícil',
  );
  String get levelVeryHard => _t(
    'Nagyon nehéz',
    en: 'Very hard',
    de: 'Sehr schwer',
    it: 'Molto difficile',
    es: 'Muy difícil',
  );
  String get myLevel => _t(
    'Nekem így megy',
    en: 'My level',
    de: 'Mein Stand',
    it: 'Il mio livello',
    es: 'Mi nivel',
  );
  String knowledgeLevelLabel(String key) => switch (key) {
    'easy' => levelEasy,
    'medium' => levelMedium,
    'hard' => levelHard,
    'zero' => levelZero,
    _ => levelVeryHard,
  };
  String get showMore => _t(
    'Mutasd mindet',
    en: 'Show all',
    de: 'Alle zeigen',
    it: 'Mostra tutto',
    es: 'Mostrar todo',
  );
  String get progressSection => _t(
    'Haladás',
    en: 'Progress',
    de: 'Fortschritt',
    it: 'Progressi',
    es: 'Progreso',
  );
  String get offlineCached => _t(
    'Offline mentve',
    en: 'Saved offline',
    de: 'Offline gespeichert',
    it: 'Salvato offline',
    es: 'Guardado sin conexión',
  );
  String get discoverOffline => _t(
    'A Felfedezéshez internet kell.',
    en: 'Discover needs internet.',
    de: 'Entdecken braucht Internet.',
    it: 'Scopri richiede internet.',
    es: 'Descubrir necesita internet.',
  );
  String get previewLessons => _t(
    'Leckék előnézete',
    en: 'Lesson preview',
    de: 'Lektionsvorschau',
    it: 'Anteprima lezioni',
    es: 'Vista previa',
  );

  String quizPhase(String phase) {
    return switch (phase) {
      'LOBBY' => _t(
        'Várakozás',
        en: 'Lobby',
        de: 'Warteraum',
        it: 'Attesa',
        es: 'Sala',
      ),
      'QUIZ_READY' => _t(
        'Kész az indulásra',
        en: 'Ready',
        de: 'Bereit',
        it: 'Pronto',
        es: 'Listo',
      ),
      'QUESTION_OPEN' => _t(
        'Kérdés',
        en: 'Question',
        de: 'Frage',
        it: 'Domanda',
        es: 'Pregunta',
      ),
      'QUESTION_CLOSED' => _t(
        'Szünet',
        en: 'Paused',
        de: 'Pause',
        it: 'Pausa',
        es: 'Pausa',
      ),
      'RESULTS_SHOWN' => _t(
        'Eredmény',
        en: 'Results',
        de: 'Ergebnis',
        it: 'Risultati',
        es: 'Resultados',
      ),
      'FINISHED' => _t(
        'Vége',
        en: 'Finished',
        de: 'Fertig',
        it: 'Finito',
        es: 'Terminado',
      ),
      _ => phase,
    };
  }
}

class _L10nDelegate extends LocalizationsDelegate<L10n> {
  const _L10nDelegate();

  @override
  bool isSupported(Locale locale) =>
      L10nLang.all.any((item) => item.code == locale.languageCode);

  @override
  Future<L10n> load(Locale locale) => SynchronousFuture(L10n(locale));

  @override
  bool shouldReload(covariant LocalizationsDelegate<L10n> old) => false;
}
