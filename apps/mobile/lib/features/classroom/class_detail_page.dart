import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/data/remote/api_client.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/toast.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';
import 'package:url_launcher/url_launcher.dart';

class ClassDetailPage extends ConsumerStatefulWidget {
  const ClassDetailPage({super.key, required this.classId});

  final String classId;

  @override
  ConsumerState<ClassDetailPage> createState() => _ClassDetailPageState();
}

class _ClassDetailPageState extends ConsumerState<ClassDetailPage> {
  Classroom? _classroom;
  List<ClassSet> _sets = [];
  List<ClassMaterial> _materials = [];
  List<BundleView> _bundles = [];
  final _quizSetIds = <String, String>{};
  final _assignedAt = <String, DateTime>{};
  String? _liveQuizId;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  var _offline = false;

  Future<void> _load() async {
    try {
      final client = ref.read(authProvider.notifier).client;
      final classroom = await client.classDetail(widget.classId);
      final sets = await client.classSets(widget.classId);
      final materials = await client.classMaterials(widget.classId);
      await ref
          .read(libraryProvider)
          .cacheClassDetail(widget.classId, sets: sets, materials: materials);
      var assigned = <Map<String, dynamic>>[];
      try {
        assigned = await client.classBundles(widget.classId);
      } on ApiException {
        assigned = const [];
      }
      final live = classroom.activeQuizId ?? (await client.activeQuiz(widget.classId))?.id;
      final userId = ref.read(libraryUserIdProvider);
      final quizSetIds = <String, String>{};
      final assignedAt = <String, DateTime>{};
      for (final raw in assigned) {
        await ref.read(libraryProvider).upsertRemoteBundle(raw, userId: userId, save: true);
        final id = raw['id'] as String?;
        if (id != null) {
          await ref.read(libraryProvider).assignClassBundle(widget.classId, id);
          final quizSetId = raw['quizSetId'] as String?;
          if (quizSetId != null) quizSetIds[id] = quizSetId;
          final at = DateTime.tryParse(raw['assignedAt'] as String? ?? '');
          if (at != null) assignedAt[id] = at;
        }
      }
      final bundles = await ref.read(libraryProvider).classBundles(widget.classId, userId);
      if (!mounted) return;
      setState(() {
        _classroom = classroom;
        _sets = sets;
        _materials = materials;
        _bundles = bundles;
        _offline = false;
        _quizSetIds
          ..clear()
          ..addAll(quizSetIds);
        _assignedAt
          ..clear()
          ..addAll(assignedAt);
        _liveQuizId = live;
      });
    } on ApiException catch (error) {
      // Offline: helyi tantermi cache (szettek, anyagok, kiosztott bundle-ök).
      final cached = await ref
          .read(libraryProvider)
          .cachedClassDetail(widget.classId);
      final userId = ref.read(libraryUserIdProvider);
      final bundles = await ref
          .read(libraryProvider)
          .classBundles(widget.classId, userId);
      if (!mounted) return;
      if (cached.sets.isNotEmpty ||
          cached.materials.isNotEmpty ||
          bundles.isNotEmpty) {
        setState(() {
          _sets = cached.sets;
          _materials = cached.materials;
          _bundles = bundles;
          _offline = true;
        });
        showAppToast(context, L10n.of(context).offlineCached);
      } else {
        showAppToast(context, L10n.of(context).apiError(error.message));
      }
    }
  }

  List<_WallEntry> get _wall {
    final me = ref.read(authProvider).user?.id;
    final classroom = _classroom;
    final items = <_WallEntry>[
      for (final material in _materials)
        _WallEntry(
          at: DateTime.tryParse(material.createdAt ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0),
          title: material.title,
          subtitle: material.note,
          icon: material.url != null ? Icons.link_rounded : Icons.chat_bubble_outline_rounded,
          canManage: material.createdBy == me,
          onTap: () => _materialActions(material),
          onManage: () => _materialActions(material),
        ),
      for (final set in _sets)
        _WallEntry(
          at: DateTime.tryParse(set.createdAt ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0),
          title: set.name,
          subtitle: L10n.of(context).subjectLabel(set.subject),
          icon: Icons.style_outlined,
          canManage: set.isOwner,
          onTap: classroom?.isTeacher == true ? () => _setActions(set) : () {},
          onManage: () => _setActions(set),
          onQuiz: classroom?.isTeacher == true ? () => _openQuizSettings(set.id) : null,
        ),
      for (final bundle in _bundles)
        _WallEntry(
          at: _assignedAt[bundle.id] ?? DateTime.fromMillisecondsSinceEpoch(0),
          title: bundle.title,
          subtitle: bundle.isTopic ? L10n.of(context).topicKind : L10n.of(context).skillKind,
          icon: bundle.isTopic ? Icons.menu_book_outlined : Icons.style_outlined,
          canManage: bundle.ownerUserId == me,
          onTap: () => context.push(bundle.openRoute),
          onManage: () => _bundleActions(bundle),
          onQuiz: classroom?.isTeacher == true && (_quizSetIds[bundle.id] != null || bundle.cardsSetId != null)
              ? () {
                  final setId = _quizSetIds[bundle.id];
                  if (setId != null) {
                    _openQuizSettings(setId);
                    return;
                  }
                  _quizFromLocal(bundle);
                }
              : null,
        ),
    ]..sort((a, b) => b.at.compareTo(a.at));
    return items;
  }

  bool get _canShare {
    final classroom = _classroom;
    return classroom != null && (classroom.isTeacher || classroom.allowStudentSets);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final classroom = _classroom;
    return Scaffold(
      appBar: AppBar(
        title: Text(classroom?.name ?? l10n.classSheet),
        actions: [
          IconButton(
            tooltip: l10n.classSettings,
            onPressed: () => context.push('/tanterem/${widget.classId}/beallitasok'),
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      floatingActionButton: _canShare
          ? FloatingActionButton.extended(
              onPressed: _busy ? null : _openShare,
              icon: const Icon(Icons.add_rounded),
              label: Text(l10n.share),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          children: [
            if (_offline)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  child: Row(
                    children: [
                      const Icon(Icons.cloud_off_outlined, size: 18),
                      const SizedBox(width: 8),
                      Expanded(child: Text(l10n.offlineCached)),
                    ],
                  ),
                ),
              ),
            if (_liveQuizId != null) ...[
              AppCard(
                onTap: () => _openQuiz(_liveQuizId!),
                child: ListTile(
                  leading: const Icon(Icons.quiz_outlined),
                  title: Text(l10n.quizLive),
                  trailing: TextButton(
                    onPressed: () => _openQuiz(_liveQuizId!),
                    child: Text(classroom?.isTeacher == true ? l10n.quizHost : l10n.quizJoin),
                  ),
                ),
              ),
              const SizedBox(height: 18),
            ],
            Text(l10n.classWall, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            if (_wall.isEmpty)
              AppCard(child: ListTile(title: Text(l10n.emptyWall)))
            else
              for (final entry in _wall) ...[
                AppCard(
                  onTap: entry.onTap,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(entry.icon),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(entry.title, style: Theme.of(context).textTheme.titleMedium),
                            if (entry.subtitle != null && entry.subtitle!.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(entry.subtitle!),
                            ],
                            const SizedBox(height: 6),
                            Text(entry.whenLabel, style: Theme.of(context).textTheme.labelSmall),
                          ],
                        ),
                      ),
                      if (entry.onQuiz != null)
                        TextButton(onPressed: entry.onQuiz, child: Text(l10n.quiz)),
                      if (entry.canManage)
                        IconButton(
                          tooltip: l10n.options,
                          onPressed: entry.onManage,
                          icon: const Icon(Icons.more_horiz_rounded),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
              ],
          ],
        ),
      ),
    );
  }

  void _openShare() {
    final l10n = L10n.of(context);
    showAppSheet(
      context: context,
      title: l10n.share,
      child: Column(
        children: [
          if (_classroom?.isTeacher == true)
            ListTile(
              leading: const Icon(Icons.quiz_outlined),
              title: Text(l10n.startQuiz),
              onTap: () {
                popAppSheet(context);
                afterSheetClosed(_pickQuizSource);
              },
            ),
          if (_classroom?.isTeacher == true)
            ListTile(
              leading: const Icon(Icons.menu_book_outlined),
              title: Text(l10n.assignLesson),
              onTap: () {
                popAppSheet(context);
                afterSheetClosed(_assignPublic);
              },
            ),
          ListTile(
            leading: const Icon(Icons.style_outlined),
            title: Text(l10n.uploadSet),
            onTap: () {
              popAppSheet(context);
              afterSheetClosed(_publishLocal);
            },
          ),
          ListTile(
            leading: const Icon(Icons.attachment_rounded),
            title: Text(l10n.addMessage),
            onTap: () {
              popAppSheet(context);
              afterSheetClosed(_openMaterialSheet);
            },
          ),
        ],
      ),
    );
  }

  void _setActions(ClassSet set) {
    final l10n = L10n.of(context);
    showAppSheet(
      context: context,
      title: set.name,
      child: Column(
        children: [
          if (_classroom?.isTeacher == true)
            ListTile(
              leading: const Icon(Icons.quiz_outlined),
              title: Text(l10n.startQuiz),
              onTap: () {
                popAppSheet(context);
                afterSheetClosed(() => _openQuizSettings(set.id));
              },
            ),
          if (set.isOwner)
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded),
              title: Text(l10n.deletePost),
              onTap: () {
                popAppSheet(context);
                _deleteSet(set.id);
              },
            ),
        ],
      ),
    );
  }

  void _bundleActions(BundleView bundle) {
    final l10n = L10n.of(context);
    showAppSheet(
      context: context,
      title: bundle.title,
      child: ListTile(
        leading: const Icon(Icons.delete_outline_rounded),
        title: Text(l10n.deletePost),
        onTap: () {
          popAppSheet(context);
          _deleteBundle(bundle.id);
        },
      ),
    );
  }

  void _materialActions(ClassMaterial material) {
    final l10n = L10n.of(context);
    final me = ref.read(authProvider).user?.id;
    final mine = material.createdBy == me;
    showAppSheet(
      context: context,
      title: material.title,
      child: Column(
        children: [
          if (material.url != null)
            ListTile(
              leading: const Icon(Icons.open_in_new_rounded),
              title: Text(l10n.openLink),
              onTap: () {
                popAppSheet(context);
                _openUrl(material.url!);
              },
            ),
          if (mine)
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: Text(l10n.editMessage),
              onTap: () {
                popAppSheet(context);
                afterSheetClosed(() => _openMaterialSheet(material));
              },
            ),
          if (mine)
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded),
              title: Text(l10n.deletePost),
              onTap: () {
                popAppSheet(context);
                _deleteMaterial(material.id);
              },
            ),
        ],
      ),
    );
  }

  Future<void> _openUrl(String raw) async {
    final uri = Uri.tryParse(raw);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _deleteSet(String id) async {
    try {
      await ref.read(authProvider.notifier).client.deleteClassSet(widget.classId, id);
      if (mounted) showAppToast(context, L10n.of(context).toastDeleted);
      await _load();
    } on ApiException catch (error) {
      if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
    }
  }

  Future<void> _deleteBundle(String id) async {
    await ref.read(libraryProvider).unassignClassBundle(widget.classId, id);
    try {
      await ref.read(authProvider.notifier).client.unassignBundle(widget.classId, id);
      if (mounted) showAppToast(context, L10n.of(context).toastDeleted);
      await _load();
    } on ApiException catch (error) {
      if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
    }
  }

  void _openMaterialSheet([ClassMaterial? existing]) {
    final l10n = L10n.of(context);
    final title = TextEditingController(text: existing?.title ?? '');
    final url = TextEditingController(text: existing?.url ?? '');
    final note = TextEditingController(text: existing?.note ?? '');
    showAppSheet(
      context: context,
      title: existing == null ? l10n.addMessage : l10n.editMessage,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(controller: title, decoration: InputDecoration(labelText: l10n.materialTitle)),
          const SizedBox(height: 10),
          TextField(
            controller: url,
            keyboardType: TextInputType.url,
            decoration: InputDecoration(labelText: l10n.materialUrl),
          ),
          const SizedBox(height: 10),
          TextField(controller: note, maxLines: 3, decoration: InputDecoration(labelText: l10n.materialNote)),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () async {
              final nextTitle = title.text;
              final nextUrl = url.text.trim();
              final nextNote = note.text.trim();
              popAppSheet(context);
              setState(() => _busy = true);
              try {
                if (existing == null) {
                  await ref.read(authProvider.notifier).client.addMaterial(
                        classId: widget.classId,
                        title: nextTitle,
                        url: nextUrl.isEmpty ? null : nextUrl,
                        note: nextNote.isEmpty ? null : nextNote,
                      );
                } else {
                  await ref.read(authProvider.notifier).client.patchMaterial(
                        classId: widget.classId,
                        materialId: existing.id,
                        title: nextTitle,
                        url: nextUrl.isEmpty ? null : nextUrl,
                        note: nextNote.isEmpty ? null : nextNote,
                      );
                }
                await _load();
                if (mounted) showAppToast(this.context, existing == null ? l10n.toastShared : l10n.toastSaved);
              } on ApiException catch (error) {
                if (mounted) showAppToast(this.context, l10n.apiError(error.message));
              } finally {
                if (mounted) setState(() => _busy = false);
              }
            },
            child: Text(l10n.save),
          ),
        ],
      ),
    ).whenComplete(() => disposeAfterSheet([title, url, note]));
  }

  Future<void> _deleteMaterial(String id) async {
    try {
      await ref.read(authProvider.notifier).client.deleteMaterial(widget.classId, id);
      if (mounted) showAppToast(context, L10n.of(context).toastDeleted);
      await _load();
    } on ApiException catch (error) {
      if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
    }
  }

  Future<void> _publishLocal() async {
    final l10n = L10n.of(context);
    final decks = (await ref.read(libraryProvider).watchAllDecks().first).where((deck) => deck.canEdit && deck.cardCount > 0).toList();
    if (!mounted) return;
    if (decks.isEmpty) {
      showAppToast(context, l10n.noOwnSets);
      return;
    }
    showAppSheet(
      context: context,
      title: l10n.pickSet,
      expand: true,
      child: Column(
        children: [
          for (final deck in decks)
            ListTile(
              title: Text(deck.name),
              subtitle: Text(deck.subjectName.isEmpty ? l10n.dueCards(deck.dueCount, deck.cardCount) : '${deck.subjectName} · ${l10n.dueCards(deck.dueCount, deck.cardCount)}'),
              onTap: () {
                popAppSheet(context);
                _publishDeck(deck);
              },
            ),
        ],
      ),
    );
  }

  Future<void> _publishDeck(DeckView deck) async {
    final cards = await ref.read(libraryProvider).cardsForDeck(deck.id);
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(authProvider.notifier).client.publishSet(
            classId: widget.classId,
            name: deck.name,
            subject: deck.subjectName.isEmpty ? deck.name : deck.subjectName,
            cards: [
              for (final card in cards) ClassCard(front: card.front, back: card.back, hint: card.hint, example: card.example),
            ],
          );
      if (mounted) showAppToast(context, L10n.of(context).toastShared);
      await _load();
    } on ApiException catch (error) {
      if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openQuizSettings(String setId) {
    if (!mounted) return;
    final l10n = L10n.of(context);
    var pace = 'teacher';
    var mode = 'choice';
    var seconds = 30;
    showAppSheet(
      context: context,
      title: l10n.startQuiz,
      child: StatefulBuilder(
        builder: (context, setLocal) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.quizPace, style: Theme.of(context).textTheme.titleMedium),
              for (final item in [
                ('teacher', l10n.quizPaceTeacher),
                ('timed', l10n.quizPaceTimed),
                ('auto', l10n.quizPaceAuto),
              ])
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  title: Text(item.$2),
                  value: item.$1,
                  groupValue: pace,
                  onChanged: (value) => setLocal(() => pace = value ?? pace),
                ),
              if (pace != 'teacher') ...[
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.quizSeconds),
                  subtitle: Text('$seconds'),
                  trailing: IconButton(
                    onPressed: () => setLocal(() => seconds = seconds >= 60 ? 15 : seconds + 15),
                    icon: const Icon(Icons.timer_outlined),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Text(l10n.quizQuestionMode, style: Theme.of(context).textTheme.titleMedium),
              for (final item in [
                ('choice', l10n.quizModeChoice),
                ('type', l10n.quizModeType),
                ('random', l10n.quizModeRandom),
              ])
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  title: Text(item.$2),
                  value: item.$1,
                  groupValue: mode,
                  onChanged: (value) => setLocal(() => mode = value ?? mode),
                ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () {
                  popAppSheet(context);
                  _startQuiz(setId, pace: pace, seconds: seconds, questionMode: mode);
                },
                child: Text(l10n.quizStart),
              ),
            ],
          );
        },
      ),
    );
  }

  void _openQuiz(String sessionId) {
    final teacher = _classroom?.isTeacher == true;
    context.push('/tanterem/${widget.classId}/doga/$sessionId${teacher ? '?tanar=1' : ''}');
  }

  void _pickQuizSource() {
    final l10n = L10n.of(context);
    final sets = _sets;
    final lessons = _bundles.where((bundle) => bundle.cardsSetId != null || _quizSetIds[bundle.id] != null).toList();
    if (sets.isEmpty && lessons.isEmpty) {
      showAppToast(context, l10n.noAssignedLessons);
      return;
    }
    showAppSheet(
      context: context,
      title: l10n.pickQuizSource,
      expand: true,
      child: Column(
        children: [
          for (final bundle in lessons)
            ListTile(
              leading: Icon(bundle.isTopic ? Icons.menu_book_outlined : Icons.style_outlined),
              title: Text(bundle.title),
              subtitle: Text(l10n.bundleMeta(bundle.isTopic ? l10n.topicKind : l10n.skillKind, bundle.subject)),
              onTap: () {
                popAppSheet(context);
                final setId = _quizSetIds[bundle.id];
                if (setId != null) {
                  _openQuizSettings(setId);
                  return;
                }
                _quizFromLocal(bundle);
              },
            ),
          for (final set in sets)
            ListTile(
              leading: const Icon(Icons.style_outlined),
              title: Text(set.name),
              subtitle: Text(l10n.subjectLabel(set.subject)),
              onTap: () {
                popAppSheet(context);
                _openQuizSettings(set.id);
              },
            ),
        ],
      ),
    );
  }

  Future<void> _assignPublic() async {
    final l10n = L10n.of(context);
    final userId = ref.read(libraryUserIdProvider);
    final public = await ref.read(libraryProvider).listPublicBundles(userId);
    if (!mounted) return;
    if (public.isEmpty) {
      showAppToast(context, l10n.noBundles);
      return;
    }
    showAppSheet(
      context: context,
      title: l10n.assignLesson,
      expand: true,
      child: Column(
        children: [
          for (final bundle in public)
            ListTile(
              title: Text(bundle.title),
              subtitle: Text(l10n.bundleMeta(bundle.isTopic ? l10n.topicKind : l10n.skillKind, bundle.subject)),
              onTap: () {
                popAppSheet(context);
                _assignBundle(bundle);
              },
            ),
        ],
      ),
    );
  }

  Future<void> _assignBundle(BundleView bundle) async {
    await ref.read(libraryProvider).assignClassBundle(widget.classId, bundle.id);
    try {
      final snap = await ref.read(libraryProvider).bundleSnapshot(bundle.id);
      final result = await ref.read(authProvider.notifier).client.assignBundle(
            classId: widget.classId,
            bundleId: bundle.id,
            snapshot: snap,
          );
      if (result.quizSetId != null) _quizSetIds[bundle.id] = result.quizSetId!;
      if (mounted) showAppToast(context, L10n.of(context).toastShared);
      await _load();
    } on ApiException catch (error) {
      if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
    }
  }

  Future<void> _quizFromLocal(BundleView bundle) async {
    if (bundle.cardsSetId == null) return;
    setState(() => _busy = true);
    try {
      final cards = await ref.read(libraryProvider).cardsForDeck(bundle.cardsSetId!);
      final setId = await ref.read(authProvider.notifier).client.publishSet(
            classId: widget.classId,
            name: bundle.title,
            subject: bundle.subject.isEmpty ? bundle.title : bundle.subject,
            cards: [
              for (final card in cards) ClassCard(front: card.front, back: card.back, hint: card.hint, example: card.example),
            ],
          );
      _quizSetIds[bundle.id] = setId;
      if (mounted) _openQuizSettings(setId);
    } on ApiException catch (error) {
      if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _startQuiz(String setId, {required String pace, required int seconds, required String questionMode}) async {
    try {
      final sessionId = await ref.read(authProvider.notifier).client.startQuiz(
            widget.classId,
            setId,
            pace: pace,
            seconds: seconds,
            questionMode: questionMode,
          );
      if (mounted) _openQuiz(sessionId);
    } on ApiException catch (error) {
      if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
    }
  }
}

class _WallEntry {
  _WallEntry({
    required this.at,
    required this.title,
    required this.icon,
    required this.onTap,
    required this.onManage,
    this.subtitle,
    this.canManage = false,
    this.onQuiz,
  });

  final DateTime at;
  final String title;
  final String? subtitle;
  final IconData icon;
  final bool canManage;
  final VoidCallback onTap;
  final VoidCallback onManage;
  final VoidCallback? onQuiz;

  String get whenLabel {
    final local = at.toLocal();
    final y = local.year.toString().padLeft(4, '0');
    final m = local.month.toString().padLeft(2, '0');
    final d = local.day.toString().padLeft(2, '0');
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '$y.$m.$d. $hh:$mm';
  }
}
