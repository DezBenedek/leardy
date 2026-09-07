import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/design_system/toast.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/features/study/content_pager_editor.dart';
import 'package:leardy/features/study/lesson_editor_blocks.dart';
import 'package:leardy/features/study/lesson_editor_save.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class LessonEditorPage extends ConsumerStatefulWidget {
  const LessonEditorPage({
    super.key,
    required this.bundleId,
    required this.lessonId,
    this.practice = false,
  });

  final String bundleId;
  final String lessonId;
  final bool practice;

  @override
  ConsumerState<LessonEditorPage> createState() => _LessonEditorPageState();
}

class _LessonEditorPageState extends ConsumerState<LessonEditorPage> {
  final _title = TextEditingController();
  final _scroll = ScrollController();
  final _queue = LessonSaveQueue();
  final _practiceSection = GlobalKey();
  final _blockKeys = <String, GlobalKey>{};
  List<LessonPageView> _pages = [];
  List<LessonExerciseView> _exercises = [];
  String? _focusId;
  var _loading = true;
  final _busyListenable = ValueNotifier(false);

  @override
  void initState() {
    super.initState();
    _queue.onBusy = (busy) {
      _busyListenable.value = busy;
    };
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _queue.onBusy = null;
    _queue.dispose();
    _busyListenable.dispose();
    _title.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final library = ref.read(libraryProvider);
    final lesson = await library.lessonById(widget.lessonId);
    final pages = await library.pagesForLesson(widget.lessonId);
    final exercises = await library.exercisesForLesson(widget.lessonId);
    if (!mounted) return;
    _title.text = lesson?.title ?? '';
    setState(() {
      _pages = pages;
      _exercises = exercises;
      _loading = false;
    });
    if (widget.practice) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = _practiceSection.currentContext;
        if (ctx != null) {
          Scrollable.ensureVisible(
            ctx,
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
          );
        }
      });
    }
  }

  GlobalKey _keyFor(String id) => _blockKeys.putIfAbsent(id, GlobalKey.new);

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        await _queue.flush();
        if (context.mounted) Navigator.of(context).pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.editLesson),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Center(
                child: ValueListenableBuilder<bool>(
                  valueListenable: _busyListenable,
                  builder: (context, busy, _) {
                    return Text(
                      busy ? l10n.savingStatus : l10n.savedStatus,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: context.ink.inkMuted,
                      ),
                    );
                  },
                ),
              ),
            ),
            IconButton(
              tooltip: l10n.previewLesson,
              onPressed: _preview,
              icon: const Icon(Icons.visibility_outlined),
            ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: CustomScrollView(
                    controller: _scroll,
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    slivers: [
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                        sliver: SliverToBoxAdapter(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              TextField(
                                controller: _title,
                                style: Theme.of(
                                  context,
                                ).textTheme.headlineMedium,
                                textCapitalization:
                                    TextCapitalization.sentences,
                                decoration: InputDecoration(
                                  labelText: l10n.lessonTitle,
                                  filled: false,
                                  border: InputBorder.none,
                                  enabledBorder: InputBorder.none,
                                  focusedBorder: InputBorder.none,
                                  contentPadding: const EdgeInsets.symmetric(
                                    vertical: 8,
                                  ),
                                ),
                                onChanged: _saveTitle,
                              ),
                              Text(
                                l10n.editorCounts(
                                  _pages.length,
                                  _exercises.length,
                                ),
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: context.ink.inkMuted),
                              ),
                            ],
                          ),
                        ),
                      ),
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 18, 16, 8),
                        sliver: SliverToBoxAdapter(
                          child: Text(
                            l10n.contentTab,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                      ),
                      SliverPadding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        sliver: SliverToBoxAdapter(
                          child: SizedBox(
                            height: 480,
                            child: ContentPagerEditor(
                              pages: _pages,
                              queue: _queue,
                              autofocusId: _focusId,
                              onSavePage: (id, body) => ref
                                  .read(libraryProvider)
                                  .updateLessonPage(id: id, body: body),
                              onType: _changePageType,
                              onDelete: _deletePage,
                              onAdd: () => _addPage(LessonStepType.text),
                            ),
                          ),
                        ),
                      ),
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 22, 16, 8),
                        sliver: SliverToBoxAdapter(
                          key: _practiceSection,
                          child: Text(
                            l10n.practiceTab,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                      ),
                      if (_exercises.isEmpty)
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                          sliver: SliverToBoxAdapter(
                            child: Text(
                              l10n.emptyPracticeEdit,
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: context.ink.inkMuted),
                            ),
                          ),
                        )
                      else
                        SliverPadding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          sliver: SliverReorderableList(
                            itemCount: _exercises.length,
                            onReorderItem: _reorderExercises,
                            proxyDecorator: _proxy,
                            itemBuilder: (context, index) {
                              final item = _exercises[index];
                              return Padding(
                                key: _keyFor(item.id),
                                padding: const EdgeInsets.only(bottom: 10),
                                child: ExerciseBlock(
                                  item: item,
                                  autofocus: _focusId == item.id,
                                  queue: _queue,
                                  dragHandle: _handle(index),
                                  onSave: ({prompt, answer, payload}) => ref
                                      .read(libraryProvider)
                                      .updateExercise(
                                        id: item.id,
                                        prompt: prompt,
                                        answer: answer,
                                        payload: payload,
                                      ),
                                  onType: (type) =>
                                      _changeExerciseType(item.id, type),
                                  onDelete: () => _deleteExercise(item.id),
                                ),
                              );
                            },
                          ),
                        ),
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
                        sliver: SliverToBoxAdapter(
                          child: AddTypeChips(
                            items: [
                              for (final type in LessonExerciseType.values)
                                (
                                  icon: exerciseTypeIcon(type),
                                  label: l10n.exerciseLabel(type),
                                  onTap: () => _addExercise(type),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }

  Widget _handle(int index) {
    return ReorderableDragStartListener(
      index: index,
      child: const Padding(
        padding: EdgeInsets.all(8),
        child: Icon(Icons.drag_handle_rounded),
      ),
    );
  }

  Widget _proxy(Widget child, int index, Animation<double> animation) {
    return Material(elevation: 2, color: Colors.transparent, child: child);
  }

  void _saveTitle(String value) {
    final title = value.trim();
    if (title.isEmpty) return;
    _queue.schedule('lesson-title', () async {
      await ref
          .read(libraryProvider)
          .updateLessonTitle(id: widget.lessonId, title: title);
    });
  }

  Future<void> _addPage(LessonStepType type) async {
    final id = await ref
        .read(libraryProvider)
        .addLessonPage(lessonId: widget.lessonId, body: '', type: type);
    if (!mounted) return;
    setState(() {
      _pages = [
        ..._pages,
        LessonPageView(
          id: id,
          lessonId: widget.lessonId,
          sortOrder: _pages.length,
          body: '',
          type: type,
        ),
      ];
      _focusId = id;
    });
    _reveal(id);
  }

  Future<void> _addExercise(LessonExerciseType type) async {
    final payload = switch (type) {
      LessonExerciseType.choice => {
        'options': <String>['', ''],
      },
      LessonExerciseType.match => {
        'pairs': [
          {'left': '', 'right': ''},
        ],
      },
      LessonExerciseType.order => {
        'items': <String>['', ''],
      },
      _ => <String, dynamic>{},
    };
    final id = await ref
        .read(libraryProvider)
        .addExercise(lessonId: widget.lessonId, type: type, payload: payload);
    if (!mounted) return;
    setState(() {
      _exercises = [
        ..._exercises,
        LessonExerciseView(
          id: id,
          lessonId: widget.lessonId,
          type: type,
          prompt: '',
          answer: '',
          payload: payload,
          sortOrder: _exercises.length,
        ),
      ];
      _focusId = id;
    });
    _reveal(id);
  }

  void _reveal(String id) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _keyFor(id).currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(
          ctx,
          alignment: 0.35,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
        );
      }
    });
  }

  void _reorderExercises(int oldIndex, int newIndex) {
    setState(() {
      final item = _exercises.removeAt(oldIndex);
      _exercises.insert(newIndex, item);
    });
    ref.read(libraryProvider).reorderExercises(widget.lessonId, [
      for (final item in _exercises) item.id,
    ]);
  }

  Future<void> _changePageType(String id, LessonStepType type) async {
    final index = _pages.indexWhere((page) => page.id == id);
    if (index < 0) return;
    setState(() => _pages[index] = _pages[index].copyWith(type: type));
    await ref.read(libraryProvider).updateLessonPage(id: id, type: type);
  }

  Future<void> _changeExerciseType(String id, LessonExerciseType type) async {
    final index = _exercises.indexWhere((item) => item.id == id);
    if (index < 0) return;
    final current = _exercises[index];
    final next = current.copyWith(
      type: type,
      payload: _payloadFor(type, current),
    );
    setState(() => _exercises[index] = next);
    await ref
        .read(libraryProvider)
        .updateExercise(id: id, type: type, payload: next.payload);
  }

  Map<String, dynamic> _payloadFor(
    LessonExerciseType type,
    LessonExerciseView current,
  ) {
    return switch (type) {
      LessonExerciseType.choice => {
        'options': [
          if (current.answer.isNotEmpty) current.answer,
          ...(current.payload['options'] as List? ?? const [])
              .whereType<String>()
              .where((item) => item != current.answer),
        ],
      },
      LessonExerciseType.match =>
        current.payload['pairs'] is List
            ? current.payload
            : {'pairs': <Map<String, String>>[]},
      LessonExerciseType.order =>
        current.payload['items'] is List
            ? current.payload
            : {'items': <String>[]},
      _ => current.payload,
    };
  }

  Future<void> _deletePage(String id) async {
    _queue.cancel(id);
    setState(
      () => _pages = [
        for (final page in _pages)
          if (page.id != id) page,
      ],
    );
    await ref.read(libraryProvider).deleteLessonPage(id);
    if (mounted) showAppToast(context, L10n.of(context).toastDeleted);
  }

  Future<void> _deleteExercise(String id) async {
    _queue.cancel(id);
    setState(
      () => _exercises = [
        for (final item in _exercises)
          if (item.id != id) item,
      ],
    );
    await ref.read(libraryProvider).deleteExercise(id);
    if (mounted) showAppToast(context, L10n.of(context).toastDeleted);
  }

  Future<void> _preview() async {
    await _queue.flush();
    if (!mounted) return;
    context.push('/tanulas/${widget.bundleId}/lecke/${widget.lessonId}');
  }
}
