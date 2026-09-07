import 'dart:async';

import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/data/remote/api_client.dart';
import 'package:leardy/design_system/components/subject_picker.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/toast.dart';
import 'package:leardy/design_system/components/knowledge_signal.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/domain/srs.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class DeckPage extends ConsumerStatefulWidget {
  const DeckPage({super.key, required this.deckId});

  final String deckId;

  @override
  ConsumerState<DeckPage> createState() => _DeckPageState();
}

class _DeckPageState extends ConsumerState<DeckPage> {
  DeckView? _deck;
  BundleView? _bundle;
  List<CardView> _cards = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final library = ref.read(libraryProvider);
    final deck = await library.deckById(widget.deckId);
    final cards = await library.cardsForDeck(widget.deckId);
    final bundle = await library.bundleForDeck(widget.deckId, ref.read(libraryUserIdProvider));
    if (!mounted) return;
    setState(() {
      _deck = deck;
      _bundle = bundle;
      _cards = cards;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final deck = _deck;
    final due = _cards.where((c) => c.dueAt <= DateTime.now().millisecondsSinceEpoch).length;
    return Scaffold(
      appBar: AppBar(
        title: Text(deck?.name ?? l10n.deck),
        actions: [
          IconButton(
            tooltip: l10n.options,
            onPressed: deck == null ? null : () => _options(deck, due),
            icon: const Icon(Icons.more_horiz_rounded),
          ),
        ],
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (deck?.canEdit == true) ...[
            FloatingActionButton.small(
              heroTag: 'add-card',
              onPressed: () => _editCard(null),
              child: const Icon(Icons.add_rounded),
            ),
            const SizedBox(height: 10),
          ],
          FloatingActionButton.extended(
            heroTag: 'practice',
            onPressed: _cards.isEmpty ? null : () => _practice(),
            icon: const Icon(Icons.play_arrow_rounded),
            label: Text(l10n.practice),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _cards.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Text(
                  l10n.emptyCards,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
              itemCount: _cards.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                if (index == 0) return _masteryHeader(context, l10n);
                final card = _cards[index - 1];
                final levelKey = levelKeyFor(card.level);
                return AppCard(
                  onTap: deck?.canEdit == true ? () => _editCard(card) : null,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  child: ListTile(
                    title: Text(card.front),
                    subtitle: Text(card.back),
                    trailing: Tooltip(
                      message: l10n.knowledgeLevelLabel(levelKey),
                      child: KnowledgeSignal(
                        level: card.level,
                        semanticLabel: l10n.knowledgeLevelLabel(levelKey),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }

  Widget _masteryHeader(BuildContext context, L10n l10n) {
    final total = _cards.length;
    final mastered = _deck?.masteredCount ?? 0;
    final percent = total == 0 ? 0 : ((mastered / total) * 100).round();
    return AppCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.masteryLabel(percent),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: total == 0 ? 0 : mastered / total,
              minHeight: 8,
            ),
          ),
        ],
      ),
    );
  }

  void _options(DeckView deck, int due) {
    final l10n = L10n.of(context);
    showAppSheet(
      context: context,
      title: deck.name,
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.info_outline_rounded),
            title: Text(l10n.cardsDueLine(_cards.length, due)),
            subtitle: Text(deck.canEdit ? l10n.ownedByYou : l10n.readOnlySet),
          ),
          if (deck.canEdit)
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: Text(l10n.editSet),
              onTap: () {
                popAppSheet(context);
                afterSheetClosed(() => _editDeck(deck));
              },
            ),
          if (deck.canEdit && _bundle != null && _bundle!.isDraft && ref.read(accountTeacherProvider))
            ListTile(
              leading: const Icon(Icons.public_outlined),
              title: Text(l10n.publishBundle),
              onTap: () {
                popAppSheet(context);
                _publish();
              },
            ),
          if (deck.canEdit && _bundle != null && _bundle!.isPublic)
            ListTile(
              leading: const Icon(Icons.public_off_outlined),
              title: Text(l10n.unpublishBundle),
              subtitle: Text(l10n.unpublishHint),
              onTap: () {
                popAppSheet(context);
                _unpublish();
              },
            ),
          if (deck.isOwner && deck.sourceClassId != null && deck.sourceSetId != null)
            ListTile(
              leading: const Icon(Icons.group_outlined),
              title: Text(l10n.editors),
              onTap: () {
                popAppSheet(context);
                afterSheetClosed(() => _editEditors(deck));
              },
            ),
          if (deck.isOwner && _bundle?.isPublic == true)
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded),
              title: Text(l10n.deleteSet),
              subtitle: Text(l10n.cannotDeletePublished),
              enabled: false,
              onTap: null,
            ),
          if (deck.isOwner && _bundle?.isPublic != true)
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded),
              title: Text(l10n.deleteSet),
              onTap: () async {
                popAppSheet(context);
                if (_bundle != null) {
                  await ref.read(libraryProvider).deleteBundle(_bundle!.id);
                } else {
                  await ref.read(libraryProvider).deleteDeck(deck.id);
                }
                if (mounted) context.pop();
              },
            ),
        ],
      ),
    );
  }

  void _editDeck(DeckView deck) {
    final l10n = L10n.of(context);
    final name = TextEditingController(text: deck.name);
    final subjects = ref.read(subjectsProvider).value ?? const <SubjectView>[];
    var subjectId = deck.subjectId;
    Future<void> persist() async {
      await ref.read(libraryProvider).updateDeck(id: deck.id, name: name.text, subjectId: subjectId);
    }

    showAppSheet(
      context: context,
      title: l10n.editSet,
      child: StatefulBuilder(
        builder: (context, setLocal) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: name,
                decoration: InputDecoration(labelText: l10n.setName),
                onChanged: (_) => persist(),
              ),
              const SizedBox(height: 12),
              SubjectField(
                library: ref.read(libraryProvider),
                subjects: ref.read(subjectsProvider).value ?? subjects,
                selectedId: subjectId,
                selectedName: subjects.where((s) => s.id == subjectId).firstOrNull?.name,
                onChanged: (picked) {
                  setLocal(() => subjectId = picked.id);
                  persist();
                },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () async {
                  await persist();
                  if (context.mounted) popAppSheet(context);
                  if (mounted) showAppToast(this.context, l10n.toastSaved);
                  await _load();
                },
                child: Text(l10n.save),
              ),
            ],
          );
        },
      ),
    ).whenComplete(() async {
      await persist();
      if (mounted) await _load();
      disposeAfterSheet([name]);
    });
  }

  void _editCard(CardView? card) {
    final l10n = L10n.of(context);
    final front = TextEditingController(text: card?.front ?? '');
    final back = TextEditingController(text: card?.back ?? '');
    final hint = TextEditingController(text: card?.hint ?? '');
    var cardId = card?.id;
    var persistChain = Future<void>.value();
    Timer? debounce;
    Future<void> persist() {
      persistChain = persistChain.then((_) async {
        if (front.text.trim().isEmpty || back.text.trim().isEmpty) return;
        cardId = await ref.read(libraryProvider).upsertCard(
              id: cardId,
              deckId: widget.deckId,
              front: front.text,
              back: back.text,
              hint: hint.text,
            );
      }).catchError((_) {});
      return persistChain;
    }

    void persistSoon() {
      debounce?.cancel();
      debounce = Timer(const Duration(milliseconds: 400), persist);
    }

    showAppSheet(
      context: context,
      title: card == null ? l10n.addCard : l10n.editCard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(controller: front, decoration: InputDecoration(labelText: l10n.cardFront), onChanged: (_) => persistSoon()),
          const SizedBox(height: 10),
          TextField(controller: back, decoration: InputDecoration(labelText: l10n.cardBackLabel), onChanged: (_) => persistSoon()),
          const SizedBox(height: 10),
          TextField(controller: hint, decoration: InputDecoration(labelText: l10n.tip), onChanged: (_) => persistSoon()),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () async {
              await persist();
              if (front.text.trim().isEmpty || back.text.trim().isEmpty) return;
              if (context.mounted) popAppSheet(context);
              if (mounted) showAppToast(this.context, l10n.toastSaved);
              await _load();
            },
            child: Text(l10n.save),
          ),
          if (card != null)
            TextButton(
              onPressed: () async {
                await ref.read(libraryProvider).deleteCard(card.id);
                if (context.mounted) popAppSheet(context);
                await _load();
              },
              child: Text(l10n.deleteCard),
            ),
        ],
      ),
    ).whenComplete(() async {
      debounce?.cancel();
      await persist();
      if (mounted) await _load();
      disposeAfterSheet([front, back, hint]);
    });
  }

  void _editEditors(DeckView deck) {
    final l10n = L10n.of(context);
    final email = TextEditingController();
    showAppSheet(
      context: context,
      title: l10n.editors,
      expand: true,
      child: FutureBuilder(
        future: ref.read(authProvider.notifier).client.setEditors(deck.sourceClassId!, deck.sourceSetId!),
        builder: (context, snapshot) {
          final editors = snapshot.data ?? const <SetEditor>[];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(controller: email, decoration: InputDecoration(labelText: l10n.editorEmail)),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () async {
                  try {
                    await ref.read(authProvider.notifier).client.addSetEditor(deck.sourceClassId!, deck.sourceSetId!, email.text);
                    if (context.mounted) popAppSheet(context);
                    afterSheetClosed(() => _editEditors(deck));
                  } on ApiException catch (error) {
                    if (context.mounted) showAppToast(context, l10n.apiError(error.message));
                  }
                },
                child: Text(l10n.addEditor),
              ),
              const SizedBox(height: 12),
              for (final editor in editors)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(editor.username),
                  subtitle: editor.email == null ? null : Text(editor.email!),
                  trailing: IconButton(
                    onPressed: () async {
                      await ref.read(authProvider.notifier).client.removeSetEditor(deck.sourceClassId!, deck.sourceSetId!, editor.userId);
                      if (context.mounted) popAppSheet(context);
                      afterSheetClosed(() => _editEditors(deck));
                    },
                    icon: const Icon(Icons.close_rounded),
                  ),
                ),
            ],
          );
        },
      ),
    ).whenComplete(() => disposeAfterSheet([email]));
  }

  void _practice() {
    final l10n = L10n.of(context);
    showAppSheet(
      context: context,
      title: l10n.howPractice,
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.flip_rounded),
            title: Text(l10n.flip),
            subtitle: Text(l10n.flipHint),
            onTap: () => _startPractice('flip'),
          ),
          ListTile(
            leading: const Icon(Icons.keyboard_alt_outlined),
            title: Text(l10n.type),
            onTap: () => _startPractice('type'),
          ),
          ListTile(
            leading: const Icon(Icons.grid_view_rounded),
            title: Text(l10n.choice),
            onTap: () => _startPractice('choice'),
          ),
          ListTile(
            leading: const Icon(Icons.quiz_outlined),
            title: Text(l10n.testMode),
            subtitle: Text(l10n.testModeHint),
            onTap: () => _startPractice('quiz'),
          ),
        ],
      ),
    );
  }

  /// Gyakorlás indítása, majd visszaérve a lista frissítése,
  /// hogy a Tudás-% és a térerő-jelzők az új állapotot mutassák.
  Future<void> _startPractice(String mod) async {
    popAppSheet(context);
    await context.push('/gyakorlas/${widget.deckId}?mod=$mod');
    if (mounted) await _load();
  }

  Future<void> _publish() async {
    final bundle = _bundle;
    if (bundle == null || !ref.read(accountTeacherProvider)) return;
    await ref.read(libraryProvider).publishBundle(bundle.id);
    if (mounted) showAppToast(context, L10n.of(context).toastPublished);
    if (!ref.read(authProvider).isAuthenticated) return;
    try {
      final snap = await ref.read(libraryProvider).bundleSnapshot(bundle.id);
      await ref.read(authProvider.notifier).client.publishBundle({...snap, 'status': 'public'});
    } on ApiException {
      // Helyben már publikálva.
    }
    await _load();
  }

  Future<void> _unpublish() async {
    final bundle = _bundle;
    if (bundle == null) return;
    await ref.read(libraryProvider).unpublishBundle(bundle.id);
    if (mounted) showAppToast(context, L10n.of(context).toastSaved);
    if (ref.read(authProvider).isAuthenticated) {
      try {
        await ref.read(authProvider.notifier).client.unpublishBundle(bundle.id);
      } on ApiException {
        // Helyben már visszavonva.
      }
    }
    await _load();
  }
}
