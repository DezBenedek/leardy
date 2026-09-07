import 'package:flutter/material.dart';
import 'package:leardy/data/library_store.dart';
import 'package:leardy/data/seed/catalog.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/l10n/l10n.dart';

Future<List<SubjectView>> loadPickerSubjects({
  required LibraryStore library,
  List<SubjectView> subjects = const [],
  String? selectedId,
}) async {
  var list = subjects;
  if (list.isEmpty) {
    list = await library.watchSubjects().first;
  }
  final recents = await library.recentSubjectIds();
  return list
      .where(
        (subject) =>
            isOfficialSubject(subject.name) ||
            subject.id == selectedId ||
            recents.contains(subject.id),
      )
      .toList();
}

Future<SubjectView?> showSubjectPicker({
  required BuildContext context,
  required LibraryStore library,
  List<SubjectView> subjects = const [],
  String? selectedId,
}) async {
  final l10n = L10n.of(context);
  final list = await loadPickerSubjects(
    library: library,
    subjects: subjects,
    selectedId: selectedId,
  );
  final recents = await library.recentSubjectIds();
  if (!context.mounted) return null;
  return showAppSheet<SubjectView>(
    context: context,
    title: l10n.pickSubject,
    expand: true,
    child: SubjectPickerList(
      subjects: list,
      recentIds: recents,
      selectedId: selectedId,
      onPick: (subject) => popAppSheet(context, subject),
    ),
  );
}

class SubjectField extends StatefulWidget {
  const SubjectField({
    super.key,
    required this.library,
    required this.onChanged,
    this.subjects = const [],
    this.selectedId,
    this.selectedName,
  });

  final LibraryStore library;
  final List<SubjectView> subjects;
  final String? selectedId;
  final String? selectedName;
  final ValueChanged<SubjectView> onChanged;

  @override
  State<SubjectField> createState() => _SubjectFieldState();
}

class _SubjectFieldState extends State<SubjectField> {
  List<SubjectView> _subjects = const [];

  @override
  void initState() {
    super.initState();
    _subjects = widget.subjects;
    _load();
  }

  Future<void> _load() async {
    final list = await loadPickerSubjects(
      library: widget.library,
      subjects: widget.subjects,
      selectedId: widget.selectedId,
    );
    if (!mounted) return;
    setState(() => _subjects = list);
    if (widget.selectedId == null &&
        (widget.selectedName == null || widget.selectedName!.isEmpty) &&
        list.isNotEmpty) {
      widget.onChanged(list.first);
    }
  }

  Future<void> _open() async {
    final picked = await showSubjectPicker(
      context: context,
      library: widget.library,
      subjects: _subjects,
      selectedId: widget.selectedId,
    );
    if (picked == null || !mounted) return;
    await widget.library.touchRecentSubject(picked.id);
    if (!mounted) return;
    widget.onChanged(picked);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final selected = _subjects
        .where((subject) => subject.id == widget.selectedId)
        .firstOrNull;
    final raw = selected?.name ?? widget.selectedName;
    final label = raw == null || raw.isEmpty
        ? l10n.pickSubject
        : l10n.subjectLabel(raw);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      title: Text(l10n.assignSubject),
      subtitle: Text(label),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: _open,
    );
  }
}

class SubjectPickerList extends StatelessWidget {
  const SubjectPickerList({
    super.key,
    required this.subjects,
    required this.onPick,
    this.recentIds = const [],
    this.selectedId,
  });

  final List<SubjectView> subjects;
  final List<String> recentIds;
  final String? selectedId;
  final ValueChanged<SubjectView> onPick;

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final recents = [
      for (final id in recentIds)
        ?subjects.where((subject) => subject.id == id).firstOrNull,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (recents.isNotEmpty) ...[
          Text(
            l10n.recentSubjects.toUpperCase(),
            style: Theme.of(context).textTheme.labelSmall,
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final subject in recents)
                FilterChip(
                  visualDensity: VisualDensity.compact,
                  selected: subject.id == selectedId,
                  label: Text(L10n.of(context).subjectLabel(subject.name)),
                  onSelected: (_) => onPick(subject),
                ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        for (final category in SubjectCategory.displayOrder)
          if (subjects.where((subject) => subject.category == category).toList()
              case final items when items.isNotEmpty) ...[
            Text(
              l10n.subjectCategoryLabel(category).toUpperCase(),
              style: Theme.of(context).textTheme.labelSmall,
            ),
            const SizedBox(height: 4),
            for (final subject in items)
              ListTile(
                dense: true,
                visualDensity: VisualDensity.compact,
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  radius: 14,
                  backgroundColor: context.ink
                      .subjectColor(subject.colorKey)
                      .withValues(alpha: 0.16),
                  child: Icon(
                    Icons.menu_book_outlined,
                    color: context.ink.subjectColor(subject.colorKey),
                    size: 14,
                  ),
                ),
                title: Text(L10n.of(context).subjectLabel(subject.name)),
                trailing: subject.id == selectedId
                    ? Icon(
                        Icons.check_rounded,
                        color: context.ink.margin,
                        size: 18,
                      )
                    : null,
                onTap: () => onPick(subject),
              ),
            const SizedBox(height: 8),
          ],
      ],
    );
  }
}
