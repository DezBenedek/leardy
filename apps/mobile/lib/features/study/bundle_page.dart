import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/data/remote/api_client.dart';
import 'package:leardy/design_system/components/subject_picker.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/toast.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class BundlePage extends ConsumerStatefulWidget {
  const BundlePage({super.key, required this.bundleId, this.startEditing = false});

  final String bundleId;
  final bool startEditing;

  @override
  ConsumerState<BundlePage> createState() => _BundlePageState();
}

class _BundlePageState extends ConsumerState<BundlePage> {
  List<LessonView> _lessons = [];
  List<LessonView> _previewLessons = [];
  late bool _editing = widget.startEditing;
  var _redirected = false;

  @override
  void initState() {
    super.initState();
    ref.listenManual(bundleProvider(widget.bundleId), (_, next) {
      _maybeRedirectSkill(next.value);
    }, fireImmediately: true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.startEditing && _canEdit) setState(() => _editing = true);
      _load();
    });
  }

  void _maybeRedirectSkill(BundleView? bundle) {
    if (_redirected || bundle == null || !bundle.isSkill || bundle.cardsSetId == null) return;
    _redirected = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.replace('/kartyak/${bundle.cardsSetId}');
    });
  }

  List<LessonView> get _visibleLessons =>
      _lessons.isNotEmpty ? _lessons : _previewLessons;

  Future<void> _load() async {
    final lessons = await ref.read(libraryProvider).lessonsForBundle(widget.bundleId);
    if (!mounted) return;
    setState(() => _lessons = lessons);
    if (lessons.isNotEmpty) return;
    // Felfedezés-előnézet: ha helyben nincs lecke (nem cache-eljük a
    // felfedezést), az API-ból töltjük be memóriába, DB-írás nélkül.
    if (!ref.read(authProvider).isAuthenticated) return;
    try {
      final raw = await ref
          .read(authProvider.notifier)
          .client
          .bundle(widget.bundleId);
      if (raw == null || !mounted) return;
      final remoteLessons = <LessonView>[];
      var order = 0;
      for (final lesson in raw['lessons'] as List? ?? const []) {
        if (lesson is! Map) continue;
        final pages = lesson['pages'] as List? ?? const [];
        remoteLessons.add(
          LessonView(
            id: lesson['id'] as String? ?? '${widget.bundleId}-p$order',
            bundleId: widget.bundleId,
            title: lesson['title'] as String? ?? '',
            sortOrder: (lesson['sortOrder'] as num?)?.toInt() ?? order,
            pageCount: pages.length,
          ),
        );
        order++;
      }
      if (mounted && remoteLessons.isNotEmpty && _lessons.isEmpty) {
        setState(() => _previewLessons = remoteLessons);
      }
    } on ApiException {
      // Offline: csak a helyi lista látszik.
    }
  }

  bool get _canEdit {
    final bundle = ref.read(bundleProvider(widget.bundleId)).value;
    if (bundle == null) return false;
    return bundle.ownedBy(ref.read(libraryUserIdProvider));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final asyncBundle = ref.watch(bundleProvider(widget.bundleId));
    if (asyncBundle.isLoading && asyncBundle.value == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (asyncBundle.hasError) {
      return Scaffold(appBar: AppBar(), body: Center(child: Text(l10n.notFound)));
    }
    final bundle = asyncBundle.value;
    if (bundle != null && bundle.isSkill && bundle.cardsSetId != null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (bundle == null) {
      return Scaffold(appBar: AppBar(), body: Center(child: Text(l10n.notFound)));
    }
    final kind = bundle.isTopic ? l10n.topicKind : l10n.skillKind;
    return Scaffold(
      appBar: AppBar(
        title: Text(_editing ? l10n.editMode : bundle.title),
        actions: [
          if (_canEdit)
            IconButton(
              tooltip: _editing ? l10n.doneEditing : l10n.editBundle,
              onPressed: () => setState(() => _editing = !_editing),
              icon: Icon(_editing ? Icons.check_rounded : Icons.edit_outlined),
            ),
          IconButton(
              tooltip: l10n.options,
              onPressed: () => _options(bundle),
              icon: const Icon(Icons.more_horiz_rounded),
            ),
        ],
      ),
      body: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                if (_editing)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(bundle.title, style: Theme.of(context).textTheme.titleLarge),
                    subtitle: Text(l10n.bundleMeta(kind, bundle.subject)),
                    trailing: const Icon(Icons.edit_outlined),
                    onTap: () => _editBundle(bundle),
                  )
                else
                  Text(l10n.bundleMeta(kind, bundle.subject), style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.ink.inkMuted)),
                const SizedBox(height: 16),
                if (!_editing && _visibleLessons.isNotEmpty)
                  _TopicProgress(lessons: _visibleLessons),
                if (!_editing && (bundle.canLearn || bundle.canPractice))
                  Row(
                    children: [
                      if (bundle.canLearn)
                        Expanded(
                          child: FilledButton.icon(
                            style: FilledButton.styleFrom(
                              minimumSize: const Size.fromHeight(52),
                            ),
                            onPressed: () => _learn(bundle),
                            icon: const Icon(Icons.menu_book_outlined),
                            label: Text(l10n.learn),
                          ),
                        ),
                      if (bundle.canLearn && bundle.canPractice) const SizedBox(width: 10),
                      if (bundle.canPractice)
                        Expanded(
                          child: FilledButton.tonalIcon(
                            style: FilledButton.styleFrom(
                              minimumSize: const Size.fromHeight(52),
                            ),
                            onPressed: () => _practice(bundle),
                            icon: const Icon(Icons.play_arrow_rounded),
                            label: Text(l10n.practiceNow),
                          ),
                        ),
                    ],
                  ),
                if (!bundle.saved) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => _save(bundle),
                      icon: const Icon(Icons.add_rounded),
                      label: Text(l10n.addToLibrary),
                    ),
                  ),
                ],
                if (bundle.isTopic) ...[
                  const SizedBox(height: 22),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          !bundle.saved && _lessons.isEmpty && _previewLessons.isNotEmpty
                              ? l10n.previewLessons
                              : l10n.lessonsHeading,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      if (_editing)
                        TextButton.icon(
                          onPressed: () => _addLesson(),
                          icon: const Icon(Icons.add_rounded),
                          label: Text(l10n.addLesson),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_visibleLessons.isEmpty)
                    Text(
                      _editing ? l10n.emptyTopicEdit : l10n.emptyTopic,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.ink.inkMuted),
                    )
                  else
                    for (final lesson in _visibleLessons) ...[
                      AppCard(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        onTap: () {
                          // Előnézet (nincs helyben): nincs hova navigálni,
                          // mert a leckeoldalak nincsenek cache-elve.
                          if (_lessons.isEmpty && _previewLessons.isNotEmpty) {
                            showAppToast(context, l10n.discoverOffline);
                            return;
                          }
                          context.push(
                            _editing
                                ? '/tanulas/${bundle.id}/lecke/${lesson.id}?szerkeszt=1'
                                : '/tanulas/${bundle.id}/lecke/${lesson.id}',
                          );
                        },
                        child: Row(
                          children: [
                            Icon(
                              lesson.completed
                                  ? Icons.check_circle_rounded
                                  : Icons.circle_outlined,
                              size: 24,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    lesson.title,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium
                                        ?.copyWith(fontSize: 17),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${l10n.lessonIndex(lesson.sortOrder + 1)} · ${lesson.pageCount} oldal',
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: context.ink.inkMuted),
                                  ),
                                ],
                              ),
                            ),
                            if (_editing)
                              IconButton(
                                tooltip: l10n.deleteLesson,
                                onPressed: () => _deleteLesson(lesson),
                                icon: const Icon(Icons.delete_outline_rounded),
                              )
                            else
                              Icon(Icons.chevron_right_rounded, color: context.ink.graphite),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                ],
              ],
            ),
    );
  }

  void _addLesson() {
    final l10n = L10n.of(context);
    final title = TextEditingController();
    final body = TextEditingController();
    showAppSheet(
      context: context,
      title: l10n.addLesson,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(controller: title, decoration: InputDecoration(labelText: l10n.lessonTitle)),
          const SizedBox(height: 12),
          TextField(
            controller: body,
            minLines: 4,
            maxLines: 8,
            textAlignVertical: TextAlignVertical.top,
            decoration: appMultilineDecoration(l10n.lessonText),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () async {
              final name = title.text.trim();
              if (name.isEmpty) return;
              final lessonId = await ref.read(libraryProvider).addLesson(bundleId: widget.bundleId, title: name, body: body.text);
              if (context.mounted) popAppSheet(context);
              if (mounted) {
                showAppToast(this.context, l10n.toastSaved);
                this.context.push('/tanulas/${widget.bundleId}/lecke/$lessonId?szerkeszt=1');
              }
              await _load();
            },
            child: Text(l10n.save),
          ),
        ],
      ),
    ).whenComplete(() => disposeAfterSheet([title, body]));
  }

  void _learn(BundleView bundle) {
    final lessonId = bundle.incompleteLessonId ?? bundle.firstLessonId;
    if (lessonId == null) return;
    context.push('/tanulas/${bundle.id}/lecke/$lessonId');
  }

  Future<void> _deleteLesson(LessonView lesson) async {
    await ref.read(libraryProvider).deleteLesson(lesson.id);
    if (mounted) showAppToast(context, L10n.of(context).toastDeleted);
    await _load();
  }

  void _practice(BundleView bundle) {
    if (bundle.isTopic && _lessons.isNotEmpty) {
      final lessonId = bundle.incompleteLessonId ?? bundle.firstLessonId ?? _lessons.first.id;
      context.push('/tanulas/${bundle.id}/lecke/$lessonId?tab=gyakorlas');
      return;
    }
    final l10n = L10n.of(context);
    final hasCards = !bundle.isTopic && bundle.cardsSetId != null;
    final hasMap = bundle.mapActivityId != null;
    if (hasCards && hasMap) {
      showAppSheet(
        context: context,
        title: l10n.practiceNow,
        child: Column(
          children: [
            ListTile(
              leading: const Icon(Icons.style_outlined),
              title: Text(l10n.cardsActivity),
              onTap: () {
                popAppSheet(context);
                context.push('/gyakorlas/${bundle.cardsSetId}');
              },
            ),
            ListTile(
              leading: const Icon(Icons.map_outlined),
              title: Text(l10n.mapPractice),
              onTap: () {
                popAppSheet(context);
                context.push('/tanulas/${bundle.id}/terkep/${bundle.mapActivityId}');
              },
            ),
          ],
        ),
      );
      return;
    }
    if (hasMap) {
      context.push('/tanulas/${bundle.id}/terkep/${bundle.mapActivityId}');
      return;
    }
    if (hasCards) context.push('/gyakorlas/${bundle.cardsSetId}');
  }

  Future<void> _save(BundleView bundle) async {
    final userId = ref.read(libraryUserIdProvider);
    await ref.read(libraryProvider).saveBundle(bundle.id, userId);
    if (mounted) showAppToast(context, L10n.of(context).toastAdded);
    if (ref.read(authProvider).isAuthenticated) {
      try {
        await ref.read(authProvider.notifier).client.saveRemoteBundle(bundle.id);
      } on ApiException catch (error) {
        if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
      }
    }
  }

  Future<void> _unsave(BundleView bundle) async {
    final userId = ref.read(libraryUserIdProvider);
    await ref.read(libraryProvider).unsaveBundle(bundle.id, userId);
    if (mounted) showAppToast(context, L10n.of(context).toastDeleted);
    if (ref.read(authProvider).isAuthenticated) {
      try {
        await ref.read(authProvider.notifier).client.unsaveRemoteBundle(bundle.id);
      } on ApiException catch (error) {
        if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
      }
    }
  }

  void _options(BundleView bundle) {
    final l10n = L10n.of(context);
    final owned = bundle.ownedBy(ref.read(libraryUserIdProvider));
    showAppSheet(
      context: context,
      title: bundle.title,
      child: Column(
        children: [
          if (_canEdit)
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: Text(l10n.editBundle),
              onTap: () {
                popAppSheet(context);
                afterSheetClosed(() => _editBundle(bundle));
              },
            ),
          if (!bundle.saved)
            ListTile(
              leading: const Icon(Icons.add_rounded),
              title: Text(l10n.addToLibrary),
              onTap: () {
                popAppSheet(context);
                _save(bundle);
              },
            ),
          if (bundle.saved && !owned)
            ListTile(
              leading: const Icon(Icons.remove_circle_outline_rounded),
              title: Text(l10n.removeFromLibrary),
              onTap: () {
                popAppSheet(context);
                _unsave(bundle);
              },
            ),
          if (_canEdit && bundle.isDraft && ref.read(accountTeacherProvider))
            ListTile(
              leading: const Icon(Icons.public_outlined),
              title: Text(l10n.publishBundle),
              onTap: () {
                popAppSheet(context);
                _publish(bundle);
              },
            ),
          if (owned && bundle.isPublic) ...[
            ListTile(
              leading: const Icon(Icons.public_off_outlined),
              title: Text(l10n.unpublishBundle),
              subtitle: Text(l10n.unpublishHint),
              onTap: () {
                popAppSheet(context);
                _unpublish(bundle);
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded),
              title: Text(l10n.deleteSet),
              subtitle: Text(l10n.cannotDeletePublished),
              enabled: false,
              onTap: null,
            ),
          ],
          if (owned && bundle.isDraft)
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded),
              title: Text(l10n.deleteSet),
              onTap: () {
                popAppSheet(context);
                _delete(bundle);
              },
            ),
        ],
      ),
    );
  }

  Future<void> _editBundle(BundleView bundle) async {
    final l10n = L10n.of(context);
    final title = TextEditingController(text: bundle.title);
    final subjects = ref.read(subjectsProvider).value ?? const <SubjectView>[];
    var subjectName = bundle.subject;
    var subjectId = subjects.where((s) => s.name == bundle.subject).firstOrNull?.id;
    Future<void> persist() async {
      final name = title.text.trim();
      if (name.isEmpty || subjectName.isEmpty) return;
      await ref.read(libraryProvider).updateBundle(id: bundle.id, title: name, subject: subjectName);
    }

    showAppSheet(
      context: context,
      title: l10n.editBundle,
      child: StatefulBuilder(
        builder: (context, setLocal) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: title,
                decoration: InputDecoration(labelText: l10n.bundleTitle),
                onChanged: (_) => persist(),
              ),
              const SizedBox(height: 12),
              SubjectField(
                library: ref.read(libraryProvider),
                subjects: ref.read(subjectsProvider).value ?? subjects,
                selectedId: subjectId,
                selectedName: subjectName,
                onChanged: (picked) {
                  setLocal(() {
                    subjectId = picked.id;
                    subjectName = picked.name;
                  });
                  persist();
                },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () async {
                  await persist();
                  if (context.mounted) popAppSheet(context);
                  if (mounted) showAppToast(this.context, l10n.toastSaved);
                },
                child: Text(l10n.save),
              ),
            ],
          );
        },
      ),
    ).whenComplete(() async {
      await persist();
      disposeAfterSheet([title]);
    });
  }

  Future<void> _publish(BundleView bundle) async {
    if (!ref.read(accountTeacherProvider)) return;
    await ref.read(libraryProvider).publishBundle(bundle.id);
    if (mounted) showAppToast(context, L10n.of(context).toastPublished);
    if (!ref.read(authProvider).isAuthenticated) return;
    try {
      final snap = await ref.read(libraryProvider).bundleSnapshot(bundle.id);
      await ref.read(authProvider.notifier).client.publishBundle({...snap, 'status': 'public'});
    } on ApiException catch (error) {
      if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
    }
  }

  Future<void> _unpublish(BundleView bundle) async {
    await ref.read(libraryProvider).unpublishBundle(bundle.id);
    if (mounted) showAppToast(context, L10n.of(context).toastSaved);
    if (ref.read(authProvider).isAuthenticated) {
      try {
        await ref.read(authProvider.notifier).client.unpublishBundle(bundle.id);
      } on ApiException catch (error) {
        if (mounted) {
          showAppToast(context, L10n.of(context).apiError(error.message));
        }
      }
    }
  }

  Future<void> _delete(BundleView bundle) async {
    if (bundle.isPublic) {
      if (mounted) {
        showAppToast(context, L10n.of(context).cannotDeletePublished);
      }
      return;
    }
    await ref.read(libraryProvider).deleteBundle(bundle.id);
    if (mounted) {
      showAppToast(context, L10n.of(context).toastDeleted);
      context.pop();
    }
  }
}

class _TopicProgress extends StatelessWidget {
  const _TopicProgress({required this.lessons});

  final List<LessonView> lessons;

  @override
  Widget build(BuildContext context) {
    if (lessons.isEmpty) return const SizedBox.shrink();
    final done = lessons.where((l) => l.completed).length;
    final progress = done / lessons.length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '$done / ${lessons.length}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 8,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
