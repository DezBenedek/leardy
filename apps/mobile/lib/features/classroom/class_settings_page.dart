import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:leardy/data/remote/api_client.dart';
import 'package:leardy/design_system/components/leardy_toggle.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/toast.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class ClassSettingsPage extends ConsumerStatefulWidget {
  const ClassSettingsPage({super.key, required this.classId});

  final String classId;

  @override
  ConsumerState<ClassSettingsPage> createState() => _ClassSettingsPageState();
}

class _ClassSettingsPageState extends ConsumerState<ClassSettingsPage> {
  Classroom? _classroom;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final classroom = await ref.read(authProvider.notifier).client.classDetail(widget.classId);
      if (!mounted) return;
      setState(() {
        _classroom = classroom;
        _error = null;
      });
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _error = error.message);
        showAppToast(context, L10n.of(context).apiError(error.message));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final classroom = _classroom;
    final me = ref.watch(authProvider).user?.id;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.classSettings)),
      body: classroom == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                Text(l10n.classSettings, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 16),
                AppCard(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.groups_outlined, size: 32),
                        title: Text(classroom.name, style: Theme.of(context).textTheme.titleLarge),
                        subtitle: Text(classroom.isTeacher ? l10n.teacher : l10n.student),
                        trailing: classroom.isTeacher ? const Icon(Icons.edit_outlined) : null,
                        onTap: classroom.isTeacher ? () => _rename(classroom) : null,
                      ),
                      if (classroom.joinCode != null) ...[
                        const Divider(height: 28),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.key_outlined, size: 28),
                          title: Text(l10n.codeLabel(classroom.joinCode!), style: Theme.of(context).textTheme.titleMedium),
                          trailing: IconButton(
                            tooltip: l10n.copyCode,
                            onPressed: () async {
                            await Clipboard.setData(ClipboardData(text: classroom.joinCode!));
                            if (context.mounted) showAppToast(context, l10n.toastCopied);
                            },
                            icon: const Icon(Icons.copy_rounded),
                          ),
                        ),
                      ],
                      if (classroom.isTeacher) ...[
                        const Divider(height: 28),
                        LeardyToggleTile(
                          title: l10n.studentsCanPublish,
                          subtitle: l10n.studentsCanPublishHint,
                          value: classroom.allowStudentSets,
                          onChanged: _busy
                              ? null
                              : (value) async {
                                  setState(() => _busy = true);
                                  try {
                                    await ref.read(authProvider.notifier).client.patchClass(classroom.id, allowStudentSets: value);
                                    await _load();
                                  } on ApiException catch (error) {
                                    if (mounted) showAppToast(this.context, l10n.apiError(error.message));
                                  } finally {
                                    if (mounted) setState(() => _busy = false);
                                  }
                                },
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                SettingsGroup(
                  title: l10n.members,
                  children: [
                    if (classroom.students.isEmpty)
                      ListTile(title: Text(l10n.noMembers))
                    else
                      for (final member in classroom.students)
                        ListTile(
                          minVerticalPadding: 14,
                          title: Text(member.username, style: Theme.of(context).textTheme.titleMedium),
                          subtitle: Text(_roleLabel(l10n, classroom, member)),
                          trailing: classroom.isTeacher && member.userId != classroom.ownerId && member.userId != me
                              ? const Icon(Icons.more_horiz_rounded)
                              : null,
                          onTap: classroom.isTeacher && member.userId != classroom.ownerId && member.userId != me
                              ? () => _memberActions(classroom, member, me)
                              : null,
                        ),
                  ],
                ),
                if (classroom.isTeacher && classroom.banned.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  SettingsGroup(
                    title: l10n.banned,
                    children: [
                      for (final member in classroom.banned)
                        ListTile(
                          title: Text(member.username),
                          trailing: TextButton(
                            onPressed: () => _run(() => ref.read(authProvider.notifier).client.unbanMember(classroom.id, member.userId)),
                            child: Text(l10n.unban),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
    );
  }

  void _rename(Classroom classroom) {
    final l10n = L10n.of(context);
    final name = TextEditingController(text: classroom.name);
    showAppSheet(
      context: context,
      title: l10n.renameClass,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(controller: name, decoration: InputDecoration(labelText: l10n.className)),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () async {
              final next = name.text.trim();
              if (next.isEmpty) return;
              popAppSheet(context);
              setState(() => _busy = true);
              try {
                await ref.read(authProvider.notifier).client.patchClass(classroom.id, name: next);
                if (mounted) showAppToast(this.context, l10n.toastSaved);
                await _load();
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
    ).whenComplete(() => disposeAfterSheet([name]));
  }

  String _roleLabel(L10n l10n, Classroom classroom, ClassMember member) {
    if (member.userId == classroom.ownerId) return l10n.owner;
    return member.isTeacher ? l10n.teacher : l10n.student;
  }

  void _memberActions(Classroom classroom, ClassMember member, String? me) {
    final l10n = L10n.of(context);
    final client = ref.read(authProvider.notifier).client;
    final isOwner = me == classroom.ownerId;
    showAppSheet(
      context: context,
      title: member.username,
      child: Column(
        children: [
          if (isOwner)
            ListTile(
              leading: const Icon(Icons.swap_horiz_rounded),
              title: Text(member.isTeacher ? l10n.makeStudent : l10n.makeTeacher),
              onTap: () {
                popAppSheet(context);
                _run(() => client.patchMemberRole(classroom.id, member.userId, member.isTeacher ? 'student' : 'teacher'));
              },
            ),
          ListTile(
            leading: const Icon(Icons.logout_rounded),
            title: Text(l10n.kick),
            onTap: () {
              popAppSheet(context);
              _run(() => client.kickMember(classroom.id, member.userId));
            },
          ),
          ListTile(
            leading: const Icon(Icons.block_rounded),
            title: Text(l10n.ban),
            onTap: () {
              popAppSheet(context);
              _run(() => client.banMember(classroom.id, member.userId));
            },
          ),
        ],
      ),
    );
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      await _load();
    } on ApiException catch (error) {
      if (mounted) showAppToast(context, L10n.of(context).apiError(error.message));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
