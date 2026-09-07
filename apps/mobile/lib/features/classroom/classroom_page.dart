import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/data/remote/api_client.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/toast.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class ClassroomPage extends ConsumerStatefulWidget {
  const ClassroomPage({super.key});

  @override
  ConsumerState<ClassroomPage> createState() => _ClassroomPageState();
}

class _ClassroomPageState extends ConsumerState<ClassroomPage> {
  List<Classroom> _classes = [];
  bool _loading = true;
  bool _offline = false;
  DateTime? _cachedAt;

  @override
  void initState() {
    super.initState();
    _loadCached().then((_) => _reload());
  }

  Future<void> _loadCached() async {
    final cached = await ref.read(libraryProvider).cachedClassrooms();
    if (!mounted || cached.items.isEmpty) return;
    setState(() {
      _classes = cached.items;
      _cachedAt = cached.updatedAt;
      _loading = false;
      _offline = true;
    });
  }

  Future<void> _reload() async {
    setState(() => _loading = _classes.isEmpty);
    try {
      final items = await ref.read(authProvider.notifier).client.classes();
      await ref.read(libraryProvider).cacheClassrooms(items);
      if (mounted) {
        setState(() {
          _classes = items;
          _offline = false;
          _cachedAt = null;
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        if (_classes.isEmpty) {
          await _loadCached();
        } else {
          setState(() => _offline = true);
        }
        if (_classes.isEmpty) {
          showAppToast(context, L10n.of(context).apiError(error.message));
        } else {
          showAppToast(context, L10n.of(context).offlineCached);
        }
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    return Scaffold(
      resizeToAvoidBottomInset: false,
      floatingActionButton: FloatingActionButton(
        tooltip: l10n.createClass,
        onPressed: _openPlus,
        child: const Icon(Icons.add_rounded),
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          children: [
            if (_offline && _classes.isNotEmpty)
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
            if (_loading && _classes.isEmpty) const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
            for (final classroom in _classes) ...[
              AppCard(
                onTap: () {
                  if (!classroom.isTeacher && classroom.hasLiveQuiz) {
                    context.push('/tanterem/${classroom.id}/doga/${classroom.activeQuizId}');
                    return;
                  }
                  context.push('/tanterem/${classroom.id}');
                },
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: (classroom.isTeacher ? context.ink.margin : context.ink.rule).withValues(alpha: 0.14),
                      child: Icon(
                        classroom.isTeacher ? Icons.school_outlined : Icons.backpack_outlined,
                        color: classroom.isTeacher ? context.ink.margin : context.ink.rule,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(classroom.name, style: Theme.of(context).textTheme.titleMedium),
                          Text(
                            [
                              classroom.isTeacher ? l10n.teacher : l10n.student,
                              l10n.people(classroom.memberCount),
                              if (classroom.joinCode != null) classroom.joinCode!,
                              if (classroom.hasLiveQuiz) l10n.quizLive,
                            ].join(' · '),
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.ink.inkMuted),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded),
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

  void _openPlus() {
    final l10n = L10n.of(context);
    showAppSheet(
      context: context,
      title: l10n.classSheet,
      child: Column(
        children: [
          if (ref.read(accountTeacherProvider))
            ListTile(
              leading: const Icon(Icons.add_home_outlined),
              title: Text(l10n.createClass),
              onTap: () {
                popAppSheet(context);
                afterSheetClosed(_openCreateDrawer);
              },
            ),
          ListTile(
            leading: const Icon(Icons.group_add_outlined),
            title: Text(l10n.join),
            onTap: () {
              popAppSheet(context);
              afterSheetClosed(_openJoinDrawer);
            },
          ),
        ],
      ),
    );
  }

  void _openCreateDrawer() {
    if (!mounted || !ref.read(accountTeacherProvider)) return;
    final l10n = L10n.of(context);
    final name = TextEditingController();
    showAppSheet(
      context: context,
      title: l10n.createClass,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(controller: name, textCapitalization: TextCapitalization.sentences, decoration: InputDecoration(labelText: l10n.newClassName)),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: () async {
              try {
                await ref.read(authProvider.notifier).client.createClass(name.text.trim());
                if (mounted) {
                  popAppSheet(context);
                  showAppToast(this.context, l10n.toastCreated);
                }
                await _reload();
              } on ApiException catch (error) {
                if (mounted) showAppToast(this.context, l10n.apiError(error.message));
              }
            },
            child: Text(l10n.openClass),
          ),
        ],
      ),
    ).whenComplete(() => disposeAfterSheet([name]));
  }

  void _openJoinDrawer() {
    if (!mounted) return;
    final l10n = L10n.of(context);
    final code = TextEditingController();
    showAppSheet(
      context: context,
      title: l10n.join,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: code,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(labelText: l10n.joinCode),
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: () async {
              try {
                await ref.read(authProvider.notifier).client.joinClass(code.text.trim());
                if (mounted) {
                  popAppSheet(context);
                  showAppToast(this.context, l10n.toastAdded);
                }
                await _reload();
              } on ApiException catch (error) {
                if (mounted) showAppToast(this.context, l10n.apiError(error.message));
              }
            },
            child: Text(l10n.join),
          ),
        ],
      ),
    ).whenComplete(() => disposeAfterSheet([code]));
  }
}
