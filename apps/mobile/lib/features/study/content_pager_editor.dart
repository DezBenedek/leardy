import 'package:flutter/material.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/lesson_format.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/features/study/lesson_editor_blocks.dart';
import 'package:leardy/features/study/lesson_editor_save.dart';
import 'package:leardy/l10n/l10n.dart';

/// Előnézet-szerű tartalom-szerkesztő: az oldalak nagyban, lapozva
/// nyílnak meg, és helyben szerkeszthetők. A fejlécben formázás,
/// a szerkesztőmező stílusa az olvasóét tükrözi.
class ContentPagerEditor extends StatefulWidget {
  const ContentPagerEditor({
    super.key,
    required this.pages,
    required this.queue,
    required this.onSavePage,
    required this.onType,
    required this.onDelete,
    required this.onAdd,
    this.autofocusId,
  });

  final List<LessonPageView> pages;
  final LessonSaveQueue queue;
  final Future<void> Function(String id, String body) onSavePage;
  final void Function(String id, LessonStepType type) onType;
  final void Function(String id) onDelete;
  final void Function() onAdd;
  final String? autofocusId;

  @override
  State<ContentPagerEditor> createState() => _ContentPagerEditorState();
}

class _ContentPagerEditorState extends State<ContentPagerEditor> {
  late final PageController _pager;
  final _controllers = <String, TextEditingController>{};
  final _prev = <String, String>{};
  var _index = 0;
  String? _autoId;
  var _applying = false;

  @override
  void initState() {
    super.initState();
    _pager = PageController();
    _syncControllers();
  }

  @override
  void didUpdateWidget(covariant ContentPagerEditor old) {
    super.didUpdateWidget(old);
    _syncControllers();
    if (widget.pages.isEmpty) {
      _index = 0;
      return;
    }
    if (_index >= widget.pages.length) {
      _index = widget.pages.length - 1;
      _jump(_index, animate: false);
    }
    if (widget.autofocusId != null &&
        widget.autofocusId != _autoId &&
        widget.pages.any((page) => page.id == widget.autofocusId)) {
      _autoId = widget.autofocusId;
      final target = widget.pages.indexWhere(
        (page) => page.id == widget.autofocusId,
      );
      setState(() => _index = target);
      _jump(target, animate: true);
    }
  }

  void _syncControllers() {
    final ids = {for (final page in widget.pages) page.id};
    for (final id in _controllers.keys.toList()) {
      if (!ids.contains(id)) {
        _controllers.remove(id)?.dispose();
        _prev.remove(id);
      }
    }
    for (final page in widget.pages) {
      final existing = _controllers[page.id];
      if (existing == null) {
        _controllers[page.id] = TextEditingController(text: page.body);
        _prev[page.id] = page.body;
      }
    }
  }

  void _jump(int page, {required bool animate}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_pager.hasClients) return;
      if (animate) {
        _pager.animateToPage(
          page,
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
        );
      } else {
        _pager.jumpToPage(page);
      }
    });
  }

  @override
  void dispose() {
    _pager.dispose();
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  LessonPageView? get _current => widget.pages.isEmpty
      ? null
      : widget.pages[_index.clamp(0, widget.pages.length - 1)];

  void _touch(String id) {
    final controller = _controllers[id];
    if (controller == null) return;
    final body = controller.text;
    widget.queue.schedule(id, () => widget.onSavePage(id, body));
  }

  void _onChanged(String id) {
    if (_applying) return;
    final controller = _controllers[id];
    if (controller == null) return;
    final prev = _prev[id] ?? '';
    final now = controller.text;
    final smart = applyLessonSmartEnter(prev, now);
    if (smart != null) {
      _applying = true;
      controller.value = TextEditingValue(
        text: smart.text,
        selection: TextSelection.collapsed(offset: smart.offset),
      );
      _prev[id] = smart.text;
      _applying = false;
    } else {
      _prev[id] = now;
    }
    _touch(id);
  }

  TextEditingController? _controllerOf(String id) => _controllers[id];

  void _wrapSelection(String marker) {
    final page = _current;
    final controller = page == null ? null : _controllerOf(page.id);
    if (page == null || controller == null) return;
    final text = controller.text;
    var start = controller.selection.start;
    var end = controller.selection.end;
    if (start < 0 || end < 0) start = end = text.length;
    if (start == end) {
      final updated = text.replaceRange(start, end, '$marker$marker');
      controller.value = TextEditingValue(
        text: updated,
        selection: TextSelection.collapsed(offset: start + marker.length),
      );
    } else {
      final updated = text.replaceRange(
        start,
        end,
        '$marker${text.substring(start, end)}$marker',
      );
      controller.value = TextEditingValue(
        text: updated,
        selection: TextSelection(
          baseOffset: start,
          extentOffset: end + marker.length * 2,
        ),
      );
    }
    _prev[page.id] = controller.text;
    _touch(page.id);
  }

  void _prefixLine(String marker) {
    final page = _current;
    final controller = page == null ? null : _controllerOf(page.id);
    if (page == null || controller == null) return;
    final text = controller.text;
    var offset = controller.selection.start;
    if (offset < 0) offset = text.length;
    final lineStart = text.lastIndexOf('\n', offset <= 0 ? 0 : offset - 1) + 1;
    if (text.substring(lineStart).startsWith(marker)) return;
    final updated = text.replaceRange(lineStart, lineStart, marker);
    controller.value = TextEditingValue(
      text: updated,
      selection: TextSelection.collapsed(offset: offset + marker.length),
    );
    _prev[page.id] = updated;
    _touch(page.id);
  }

  TextStyle? _fieldStyle(BuildContext context, LessonStepType type) {
    return switch (type) {
      LessonStepType.fact => Theme.of(
        context,
      ).textTheme.titleLarge?.copyWith(height: 1.4),
      LessonStepType.source => Theme.of(context).textTheme.bodyLarge?.copyWith(
        fontStyle: FontStyle.italic,
        height: 1.6,
        fontSize: 17,
      ),
      _ => Theme.of(
        context,
      ).textTheme.bodyLarge?.copyWith(height: 1.6, fontSize: 17),
    };
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final page = _current;
    if (widget.pages.isEmpty || page == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              l10n.emptyStepsEdit,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.ink.inkMuted,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: widget.onAdd,
              icon: const Icon(Icons.add_rounded),
              label: Text(l10n.addStep),
            ),
          ],
        ),
      );
    }
    final fact = page.type == LessonStepType.fact;
    final types = [
      for (final type in LessonStepType.values)
        if (type != LessonStepType.prompt || page.type == LessonStepType.prompt)
          type,
    ];
    return Card(
      color: fact ? context.ink.margin.withValues(alpha: 0.08) : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
        child: Column(
          children: [
            Row(
              children: [
                PopupMenuButton<LessonStepType>(
                  initialValue: page.type,
                  tooltip: l10n.stepLabel(page.type),
                  onSelected: (type) => widget.onType(page.id, type),
                  itemBuilder: (context) => [
                    for (final type in types)
                      PopupMenuItem(
                        value: type,
                        child: Text(l10n.stepLabel(type)),
                      ),
                  ],
                  child: _TypeChip(
                    icon: stepTypeIcon(page.type),
                    label: l10n.stepLabel(page.type),
                  ),
                ),
                IconButton(
                  tooltip: l10n.formatBold,
                  visualDensity: VisualDensity.compact,
                  onPressed: () => _wrapSelection('**'),
                  icon: const Icon(Icons.format_bold_rounded),
                ),
                IconButton(
                  tooltip: l10n.formatItalic,
                  visualDensity: VisualDensity.compact,
                  onPressed: () => _wrapSelection('*'),
                  icon: const Icon(Icons.format_italic_rounded),
                ),
                IconButton(
                  tooltip: l10n.formatList,
                  visualDensity: VisualDensity.compact,
                  onPressed: () => _prefixLine('- '),
                  icon: const Icon(Icons.format_list_bulleted_rounded),
                ),
                const Spacer(),
                IconButton(
                  tooltip: l10n.deleteStep,
                  visualDensity: VisualDensity.compact,
                  onPressed: () => widget.onDelete(page.id),
                  icon: const Icon(Icons.delete_outline_rounded),
                ),
              ],
            ),
            Expanded(
              child: PageView.builder(
                controller: _pager,
                onPageChanged: (value) => setState(() => _index = value),
                itemCount: widget.pages.length,
                itemBuilder: (context, index) {
                  final item = widget.pages[index];
                  final controller = _controllerOf(item.id);
                  if (controller == null) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                    child: TextField(
                      controller: controller,
                      autofocus: _autoId == item.id,
                      expands: true,
                      maxLines: null,
                      minLines: null,
                      textAlignVertical: TextAlignVertical.top,
                      textCapitalization: TextCapitalization.sentences,
                      keyboardType: TextInputType.multiline,
                      style: _fieldStyle(context, item.type),
                      decoration: const InputDecoration(
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                      ),
                      onChanged: (_) => _onChanged(item.id),
                    ),
                  );
                },
              ),
            ),
            Row(
              children: [
                IconButton(
                  tooltip: MaterialLocalizations.of(
                    context,
                  ).previousPageTooltip,
                  onPressed: _index > 0
                      ? () => _pager.previousPage(
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOutCubic,
                        )
                      : null,
                  icon: const Icon(Icons.chevron_left_rounded),
                ),
                Expanded(
                  child: Text(
                    '${_index + 1} / ${widget.pages.length}',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: context.ink.inkMuted,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: widget.onAdd,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: Text(l10n.addStep),
                ),
                IconButton(
                  tooltip: MaterialLocalizations.of(context).nextPageTooltip,
                  onPressed: _index < widget.pages.length - 1
                      ? () => _pager.nextPage(
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOutCubic,
                        )
                      : null,
                  icon: const Icon(Icons.chevron_right_rounded),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: context.ink.inkMuted),
          const SizedBox(width: 6),
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          Icon(
            Icons.expand_more_rounded,
            size: 18,
            color: context.ink.inkMuted,
          ),
        ],
      ),
    );
  }
}
