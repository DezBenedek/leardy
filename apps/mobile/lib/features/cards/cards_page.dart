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
import 'package:leardy/features/cards/library_query.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class CardsPage extends ConsumerStatefulWidget {
  const CardsPage({super.key});

  @override
  ConsumerState<CardsPage> createState() => _CardsPageState();
}

class _CardsPageState extends ConsumerState<CardsPage>
    with WidgetsBindingObserver {
  final _search = TextEditingController();
  Future<void>? _remoteLoad;
  List<BundleView> _discoverMemory = [];
  bool _discoverLoading = false;
  String? _discoverError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _search.text = ref.read(librarySearchProvider);
      _loadRemote();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _search.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _loadRemote();
  }

  Future<void> _loadRemote() {
    return _remoteLoad ??= _fetchRemote().whenComplete(
      () => _remoteLoad = null,
    );
  }

  Future<void> _fetchRemote() async {
    if (!ref.read(authProvider).isAuthenticated) return;
    try {
      final client = ref.read(authProvider.notifier).client;
      final items = await ref.refresh(classroomsProvider.future);
      final userId = ref.read(libraryUserIdProvider);
      // Felfedezés: NEM cache-eljük DB-be, csak memóriában tartjuk.
      if (mounted) {
        setState(() {
          _discoverLoading = true;
          _discoverError = null;
        });
      }
      try {
        final public = await client.publicBundles();
        final savedIds = {
          for (final b
              in await ref.read(libraryProvider).listSavedBundles(userId))
            b.id,
        };
        final memory = <BundleView>[];
        for (final raw in public) {
          final id = raw['id'] as String?;
          if (id == null || savedIds.contains(id)) continue;
          memory.add(_bundleViewFromSnapshot(raw));
        }
        memory.sort(
          (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
        );
        if (mounted) {
          setState(() {
            _discoverMemory = memory;
            _discoverLoading = false;
          });
        }
        // Régi cache-sorok takarítása (egyszeri + folyamatos).
        await ref
            .read(libraryProvider)
            .pruneUncachedDiscoverBundles(userId: userId);
      } on ApiException {
        if (mounted) {
          setState(() {
            _discoverLoading = false;
            _discoverError = 'offline';
          });
        }
      }
      // Tantermi kiosztott: ezt CACHE-eljük (offline tanterem).
      for (final classroom in items) {
        try {
          final assigned = await client.classBundles(classroom.id);
          for (final raw in assigned) {
            await ref
                .read(libraryProvider)
                .upsertRemoteBundle(raw, userId: userId, save: true);
            await ref
                .read(libraryProvider)
                .assignClassBundle(classroom.id, raw['id'] as String);
          }
        } on ApiException {
          // Offline: a helyi tantermi cache elég.
        }
      }
      ref.invalidate(classAssignedIdsProvider);
    } on ApiException {
      // Offline: a helyi lista elég.
    }
  }

  BundleView _bundleViewFromSnapshot(Map<String, dynamic> raw) {
    final lessons = raw['lessons'] as List? ?? const [];
    final activities = raw['activities'] as List? ?? const [];
    var cardCount = 0;
    String? cardsSetId;
    String? mapActivityId;
    for (final activity in activities) {
      if (activity is! Map) continue;
      if (activity['type'] == 'cards') {
        final cards = activity['cards'] as List? ?? const [];
        cardCount += cards.length;
      }
      if (activity['type'] == 'map' && mapActivityId == null) {
        mapActivityId = activity['id'] as String?;
      }
    }
    return BundleView(
      id: raw['id'] as String? ?? '',
      kind: raw['kind'] as String? ?? 'skill',
      subject: raw['subject'] as String? ?? '',
      title: raw['title'] as String? ?? '',
      status: raw['status'] as String? ?? 'public',
      ownerUserId: raw['ownerId'] as String?,
      saved: false,
      lessonCount: lessons.length,
      activityCount: activities.length,
      cardsSetId: cardsSetId,
      mapActivityId: mapActivityId,
      dueCount: 0,
      cardCount: cardCount,
      firstLessonId: lessons.isNotEmpty && lessons.first is Map
          ? (lessons.first as Map)['id'] as String?
          : null,
    );
  }

  Widget _refreshable({required Widget child}) {
    return RefreshIndicator(onRefresh: _loadRemote, child: child);
  }

  Widget _emptyList(String message) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [SizedBox(height: 240, child: Center(child: Text(message)))],
    );
  }

  Widget _discoverList(
    L10n l10n,
    String search,
    CardsQuery query,
    String? subjectName,
    Set<String>? assigned,
  ) {
    if (_discoverLoading && _discoverMemory.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(
            height: 240,
            child: Center(child: CircularProgressIndicator()),
          ),
        ],
      );
    }
    if (_discoverError != null && _discoverMemory.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 240,
            child: Center(child: Text(l10n.discoverOffline)),
          ),
        ],
      );
    }
    final visible = _discoverMemory
        .where(
          (bundle) => bundleMatchesQuery(
            bundle: bundle,
            search: search,
            query: query,
            discover: true,
            subjectName: subjectName,
            classBundleIds: assigned,
            subjectDisplay: l10n.subjectLabel(bundle.subject),
          ),
        )
        .toList();
    if (visible.isEmpty) {
      return _emptyList(
        _discoverError != null ? l10n.discoverOffline : l10n.noBundles,
      );
    }
    final topics = visible.where((b) => b.isTopic).toList();
    final cards = visible.where((b) => b.isSkill).toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
      children: [
        if (topics.isNotEmpty) ...[
          Text(l10n.discoverTopics, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final bundle in topics) ...[
            _BundleCard(bundle: bundle, discover: true),
            const SizedBox(height: 8),
          ],
        ],
        if (cards.isNotEmpty) ...[
          if (topics.isNotEmpty) const SizedBox(height: 8),
          Text(l10n.discoverCardPacks, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final bundle in cards) ...[
            _BundleCard(bundle: bundle, discover: true),
            const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final tab = ref.watch(libraryTabProvider);
    final search = ref.watch(librarySearchProvider);
    final query = ref.watch(cardsQueryProvider);
    final mine = ref.watch(savedBundlesProvider);
    final public = ref.watch(publicBundlesProvider);
    final subjects = ref.watch(subjectsProvider).value ?? const <SubjectView>[];
    final async = tab == LibraryTab.mine ? mine : public;
    final discover = tab == LibraryTab.discover;
    final subjectName = subjects
        .where((s) => s.id == query.subjectId)
        .firstOrNull
        ?.name;
    final assigned = query.classId == null
        ? null
        : ref.watch(classAssignedIdsProvider(query.classId!)).value;

    return Scaffold(
      floatingActionButton: FloatingActionButton(
        tooltip: l10n.newBundle,
        onPressed: _openPlus,
        child: const Icon(Icons.add_rounded),
      ),
      body: Column(
        children: [
          if (discover)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 16, 0),
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: IconButton(
                  tooltip: l10n.backToMine,
                  onPressed: () => ref.read(libraryTabProvider.notifier).state =
                      LibraryTab.mine,
                  icon: const Icon(Icons.arrow_back_rounded),
                ),
                title: Text(
                  l10n.discover,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _search,
                    onChanged: (value) =>
                        ref.read(librarySearchProvider.notifier).state = value,
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.search_rounded),
                      hintText: l10n.searchBundles,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: l10n.searchCards,
                  onPressed: () => context.push('/kereses'),
                  icon: const Icon(Icons.manage_search_rounded),
                ),
                IconButton(
                  tooltip: l10n.filterBundles,
                  onPressed: _openFilters,
                  icon: Badge(
                    isLabelVisible: query.hasFilters,
                    smallSize: 8,
                    child: Icon(
                      query.hasFilters
                          ? Icons.filter_alt_rounded
                          : Icons.filter_alt_outlined,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _refreshable(
              child: discover
                  ? _discoverList(
                      l10n,
                      search,
                      query,
                      subjectName,
                      assigned,
                    )
                  : async.when(
                loading: () => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const [
                    SizedBox(
                      height: 240,
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ],
                ),
                error: (error, _) => _emptyList(l10n.noBundles),
                data: (items) {
                  final visible = items
                      .where(
                        (bundle) => bundleMatchesQuery(
                          bundle: bundle,
                          search: search,
                          query: query,
                          discover: discover,
                          subjectName: subjectName,
                          classBundleIds: assigned,
                          subjectDisplay: l10n.subjectLabel(bundle.subject),
                        ),
                      )
                      .toList();
                  if (visible.isEmpty) {
                    return _emptyList(l10n.noBundles);
                  }
                  final topics = visible.where((b) => b.isTopic).toList();
                  final cards = visible.where((b) => b.isSkill).toList();
                  final topicTitle = discover
                      ? l10n.discoverTopics
                      : l10n.myTopics;
                  final cardTitle = discover
                      ? l10n.discoverCardPacks
                      : l10n.myCardPacks;
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                    children: [
                      if (topics.isNotEmpty) ...[
                        Text(
                          topicTitle,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        for (final bundle in topics) ...[
                          _BundleCard(bundle: bundle, discover: discover),
                          const SizedBox(height: 8),
                        ],
                      ],
                      if (cards.isNotEmpty) ...[
                        if (topics.isNotEmpty) const SizedBox(height: 8),
                        Text(
                          cardTitle,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        for (final bundle in cards) ...[
                          _BundleCard(bundle: bundle, discover: discover),
                          const SizedBox(height: 8),
                        ],
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _openPlus() {
    final l10n = L10n.of(context);
    showAppSheet(
      context: context,
      title: l10n.newBundle,
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.menu_book_outlined),
            title: Text(l10n.topicKind),
            onTap: () {
              popAppSheet(context);
              afterSheetClosed(() => _createBundle('topic'));
            },
          ),
          ListTile(
            leading: const Icon(Icons.style_outlined),
            title: Text(l10n.skillKind),
            onTap: () {
              popAppSheet(context);
              afterSheetClosed(() => _createBundle('skill'));
            },
          ),
          ListTile(
            leading: const Icon(Icons.explore_outlined),
            title: Text(l10n.discover),
            onTap: () {
              popAppSheet(context);
              ref.read(libraryTabProvider.notifier).state = LibraryTab.discover;
            },
          ),
        ],
      ),
    );
  }

  void _createBundle(String kind) {
    final l10n = L10n.of(context);
    final title = TextEditingController();
    String? subjectId;
    String? subjectName;
    var hasTitle = false;
    showAppSheet(
      context: context,
      title: kind == 'topic' ? l10n.topicKind : l10n.skillKind,
      child: StatefulBuilder(
        builder: (context, setLocal) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: title,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(labelText: l10n.bundleTitle),
                onChanged: (value) =>
                    setLocal(() => hasTitle = value.trim().isNotEmpty),
              ),
              const SizedBox(height: 4),
              SubjectField(
                library: ref.read(libraryProvider),
                subjects: ref.read(subjectsProvider).value ?? const [],
                selectedId: subjectId,
                selectedName: subjectName,
                onChanged: (picked) => setLocal(() {
                  subjectId = picked.id;
                  subjectName = picked.name;
                }),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed:
                    !hasTitle || subjectName == null || subjectName!.isEmpty
                    ? null
                    : () async {
                        final name = title.text.trim();
                        if (name.isEmpty ||
                            subjectName == null ||
                            subjectName!.isEmpty)
                          return;
                        final library = ref.read(libraryProvider);
                        final id = await library.createBundle(
                          kind: kind,
                          title: name,
                          subject: subjectName!,
                          ownerUserId:
                              ref.read(authProvider).user?.id ?? 'local',
                        );
                        if (kind == 'topic') {
                          final lessons = await library.lessonsForBundle(id);
                          final lessonId =
                              lessons.firstOrNull?.id ??
                              await library.addLesson(
                                bundleId: id,
                                title: name,
                              );
                          if (!mounted) return;
                          popAppSheet(this.context);
                          showAppToast(this.context, l10n.toastSaved);
                          this.context.push(
                            '/tanulas/$id/lecke/$lessonId?szerkeszt=1',
                          );
                          return;
                        }
                        if (!mounted) return;
                        popAppSheet(this.context);
                        showAppToast(this.context, l10n.toastSaved);
                        final created = await library.bundleById(
                          id,
                          ref.read(libraryUserIdProvider),
                        );
                        if (!mounted) return;
                        this.context.push(created?.openRoute ?? '/tanulas/$id');
                      },
                child: Text(l10n.save),
              ),
            ],
          );
        },
      ),
    ).whenComplete(() => disposeAfterSheet([title]));
  }

  void _openFilters() {
    _loadRemote();
    final l10n = L10n.of(context);
    final subjects = ref.read(subjectsProvider).value ?? const <SubjectView>[];
    showAppSheet(
      context: context,
      title: l10n.filterBundles,
      expand: true,
      child: Consumer(
        builder: (context, ref, _) {
          final query = ref.watch(cardsQueryProvider);
          final classrooms =
              ref.watch(classroomsProvider).value ?? const <Classroom>[];
          final selectedSubject = subjects
              .where((s) => s.id == query.subjectId)
              .firstOrNull;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.subject,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  selectedSubject == null
                      ? l10n.allSubjects
                      : l10n.subjectLabel(selectedSubject.name),
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () async {
                  final picked = await showSubjectPicker(
                    context: context,
                    library: ref.read(libraryProvider),
                    subjects: subjects,
                    selectedId: query.subjectId,
                  );
                  if (picked == null) return;
                  ref.read(cardsQueryProvider.notifier).state = query.copyWith(
                    subjectId: picked.id,
                  );
                },
              ),
              const SizedBox(height: 8),
              Text(
                l10n.filterKind,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  FilterChip(
                    selected: query.kind == null,
                    label: Text(l10n.filterAll),
                    onSelected: (_) =>
                        ref.read(cardsQueryProvider.notifier).state = query
                            .copyWith(clearKind: true),
                  ),
                  FilterChip(
                    selected: query.kind == 'topic',
                    label: Text(l10n.topicKind),
                    onSelected: (_) =>
                        ref.read(cardsQueryProvider.notifier).state = query
                            .copyWith(kind: 'topic'),
                  ),
                  FilterChip(
                    selected: query.kind == 'skill',
                    label: Text(l10n.skillKind),
                    onSelected: (_) =>
                        ref.read(cardsQueryProvider.notifier).state = query
                            .copyWith(kind: 'skill'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                l10n.classSheet,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              RadioListTile<String?>(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.allClasses),
                value: null,
                groupValue: query.classId,
                onChanged: (_) => ref.read(cardsQueryProvider.notifier).state =
                    query.copyWith(clearClass: true),
              ),
              for (final classroom in classrooms)
                RadioListTile<String?>(
                  contentPadding: EdgeInsets.zero,
                  title: Text(classroom.name),
                  value: classroom.id,
                  groupValue: query.classId,
                  onChanged: (value) =>
                      ref.read(cardsQueryProvider.notifier).state = query
                          .copyWith(classId: value),
                ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: query.hasFilters
                    ? () => ref.read(cardsQueryProvider.notifier).state =
                          const CardsQuery()
                    : null,
                child: Text(l10n.clearFilters),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _BundleCard extends ConsumerWidget {
  const _BundleCard({required this.bundle, required this.discover});

  final BundleView bundle;
  final bool discover;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = L10n.of(context);
    final kind = bundle.isTopic ? l10n.topicKind : l10n.skillKind;
    return AppCard(
      onTap: () => _open(context, ref),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  bundle.title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (bundle.isDraft)
                Text(
                  l10n.draftStatus,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              if (discover)
                PopupMenuButton<String>(
                  tooltip: l10n.options,
                  icon: const Icon(Icons.more_horiz_rounded),
                  onSelected: (value) {
                    if (value == 'open') {
                      _open(context, ref);
                    } else if (value == 'save') {
                      _save(context, ref);
                    }
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'open',
                      child: Text(l10n.previewLesson),
                    ),
                    PopupMenuItem(
                      value: 'save',
                      child: Text(l10n.addToLibrary),
                    ),
                  ],
                )
              else
                Icon(
                  Icons.chevron_right_rounded,
                  color: context.ink.graphite,
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            l10n.bundleMeta(kind, bundle.subject),
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: context.ink.inkMuted),
          ),
          if (bundle.cardCount > 0 && !bundle.isTopic) ...[
            const SizedBox(height: 4),
            Text(
              l10n.dueCards(bundle.dueCount, bundle.cardCount),
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: context.ink.inkMuted),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _open(BuildContext context, WidgetRef ref) async {
    if (!discover) {
      context.push(bundle.openRoute);
      return;
    }
    // Felfedezés nincs cache-elve: megnyitáskor egyszer letöltjük
    // (mentés nélkül), hogy az előnézet (leckék + Felveszem) működjön.
    final userId = ref.read(libraryUserIdProvider);
    final existing = await ref.read(libraryProvider).bundleById(bundle.id, userId);
    if (existing != null) {
      context.push(existing.openRoute);
      return;
    }
    if (!ref.read(authProvider).isAuthenticated) {
      context.push(bundle.openRoute);
      return;
    }
    try {
      final raw = await ref.read(authProvider.notifier).client.bundle(bundle.id);
      if (raw != null) {
        await ref.read(libraryProvider).upsertRemoteBundle(raw, userId: userId);
        final fresh = await ref
            .read(libraryProvider)
            .bundleById(bundle.id, userId);
        if (context.mounted) {
          context.push(fresh?.openRoute ?? bundle.openRoute);
        }
        return;
      }
    } on ApiException {
      // Offline: próbáljuk a nyers route-tal.
    }
    context.push(bundle.openRoute);
  }

  Future<void> _save(BuildContext context, WidgetRef ref) async {
    final l10n = L10n.of(context);
    final userId = ref.read(libraryUserIdProvider);
    // Felfedezés nincs cache-elve: mentéskor töltjük le egyszer.
    if (discover) {
      final existing = await ref
          .read(libraryProvider)
          .bundleById(bundle.id, userId);
      if (existing == null && ref.read(authProvider).isAuthenticated) {
        try {
          final raw = await ref
              .read(authProvider.notifier)
              .client
              .bundle(bundle.id);
          if (raw != null) {
            await ref
                .read(libraryProvider)
                .upsertRemoteBundle(raw, userId: userId, save: true);
          }
        } on ApiException catch (error) {
          if (context.mounted) {
            showAppToast(context, l10n.apiError(error.message));
          }
          return;
        }
      }
    }
    await ref.read(libraryProvider).saveBundle(bundle.id, userId);
    if (context.mounted) showAppToast(context, l10n.toastAdded);
    if (ref.read(authProvider).isAuthenticated) {
      try {
        await ref
            .read(authProvider.notifier)
            .client
            .saveRemoteBundle(bundle.id);
      } on ApiException catch (error) {
        if (context.mounted)
          showAppToast(context, l10n.apiError(error.message));
      }
    }
  }

}
