import 'package:flutter/material.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/features/study/lesson_editor_save.dart';
import 'package:leardy/l10n/l10n.dart';

IconData stepTypeIcon(LessonStepType type) {
  return switch (type) {
    LessonStepType.text => Icons.notes_rounded,
    LessonStepType.fact => Icons.bolt_rounded,
    LessonStepType.prompt => Icons.chat_bubble_outline_rounded,
    LessonStepType.source => Icons.format_quote_rounded,
  };
}

IconData exerciseTypeIcon(LessonExerciseType type) {
  return switch (type) {
    LessonExerciseType.flip => Icons.style_outlined,
    LessonExerciseType.choice => Icons.checklist_rounded,
    LessonExerciseType.type => Icons.keyboard_alt_outlined,
    LessonExerciseType.match => Icons.join_inner_rounded,
    LessonExerciseType.order => Icons.format_list_numbered_rounded,
  };
}


class ExerciseBlock extends StatefulWidget {
  const ExerciseBlock({
    super.key,
    required this.item,
    required this.dragHandle,
    required this.queue,
    required this.autofocus,
    required this.onSave,
    required this.onType,
    required this.onDelete,
  });

  final LessonExerciseView item;
  final Widget dragHandle;
  final LessonSaveQueue queue;
  final bool autofocus;
  final Future<void> Function({
    String? prompt,
    String? answer,
    Map<String, dynamic>? payload,
  })
  onSave;
  final ValueChanged<LessonExerciseType> onType;
  final VoidCallback onDelete;

  @override
  State<ExerciseBlock> createState() => _ExerciseBlockState();
}

class _ExerciseBlockState extends State<ExerciseBlock> {
  late final TextEditingController _prompt;
  late final TextEditingController _answer;
  final _options = <TextEditingController>[];
  final _lefts = <TextEditingController>[];
  final _rights = <TextEditingController>[];
  final _items = <TextEditingController>[];
  var _correct = 0;

  @override
  void initState() {
    super.initState();
    _prompt = TextEditingController(text: widget.item.prompt);
    _answer = TextEditingController(text: widget.item.answer);
    _hydrateExtras();
  }

  @override
  void didUpdateWidget(covariant ExerciseBlock old) {
    super.didUpdateWidget(old);
    if (old.item.id != widget.item.id || old.item.type != widget.item.type) {
      if (old.item.id != widget.item.id) {
        _prompt.text = widget.item.prompt;
        _answer.text = widget.item.answer;
      }
      _hydrateExtras();
    }
  }

  @override
  void dispose() {
    _prompt.dispose();
    _answer.dispose();
    _disposeAll(_options);
    _disposeAll(_lefts);
    _disposeAll(_rights);
    _disposeAll(_items);
    super.dispose();
  }

  void _hydrateExtras() {
    final item = widget.item;
    _disposeAll(_options);
    _disposeAll(_lefts);
    _disposeAll(_rights);
    _disposeAll(_items);
    _options.clear();
    _lefts.clear();
    _rights.clear();
    _items.clear();
    switch (item.type) {
      case LessonExerciseType.choice:
        final raw = (item.payload['options'] as List? ?? [])
            .whereType<String>()
            .toList();
        final options = [
          if (item.answer.isNotEmpty && !raw.contains(item.answer)) item.answer,
          ...raw,
        ];
        if (options.isEmpty) options.addAll(['', '']);
        _options.addAll([
          for (final value in options) TextEditingController(text: value),
        ]);
        _correct = item.answer.isEmpty
            ? 0
            : options.indexOf(item.answer).clamp(0, options.length - 1);
      case LessonExerciseType.match:
        final pairs = [
          for (final pair in item.payload['pairs'] as List? ?? [])
            if (pair is Map)
              (
                left: pair['left'] as String? ?? '',
                right: pair['right'] as String? ?? '',
              ),
        ];
        if (pairs.isEmpty) pairs.add((left: '', right: ''));
        for (final pair in pairs) {
          _lefts.add(TextEditingController(text: pair.left));
          _rights.add(TextEditingController(text: pair.right));
        }
      case LessonExerciseType.order:
        final values = (item.payload['items'] as List? ?? [])
            .whereType<String>()
            .toList();
        if (values.isEmpty) values.addAll(['', '']);
        _items.addAll([
          for (final value in values) TextEditingController(text: value),
        ]);
      case LessonExerciseType.flip:
      case LessonExerciseType.type:
        break;
    }
  }

  void _disposeAll(List<TextEditingController> items) {
    for (final item in items) {
      item.dispose();
    }
  }

  void _touch() {
    final id = widget.item.id;
    final prompt = _prompt.text;
    final type = widget.item.type;
    switch (type) {
      case LessonExerciseType.flip:
      case LessonExerciseType.type:
        final answer = _answer.text;
        widget.queue.schedule(
          id,
          () => widget.onSave(prompt: prompt, answer: answer),
        );
      case LessonExerciseType.choice:
        final filled = <String>[];
        var answer = '';
        for (var i = 0; i < _options.length; i++) {
          final text = _options[i].text.trim();
          if (text.isEmpty) continue;
          filled.add(text);
          if (i == _correct) answer = text;
        }
        if (answer.isEmpty && filled.isNotEmpty) answer = filled.first;
        widget.queue.schedule(
          id,
          () => widget.onSave(
            prompt: prompt,
            answer: answer,
            payload: {'options': filled},
          ),
        );
      case LessonExerciseType.match:
        final pairs = [
          for (var i = 0; i < _lefts.length; i++)
            if (_lefts[i].text.trim().isNotEmpty ||
                _rights[i].text.trim().isNotEmpty)
              {'left': _lefts[i].text.trim(), 'right': _rights[i].text.trim()},
        ];
        widget.queue.schedule(
          id,
          () => widget.onSave(prompt: prompt, payload: {'pairs': pairs}),
        );
      case LessonExerciseType.order:
        final items = [
          for (final item in _items) item.text.trim(),
        ].where((item) => item.isNotEmpty).toList();
        widget.queue.schedule(
          id,
          () => widget.onSave(prompt: prompt, payload: {'items': items}),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final item = widget.item;
    return _BlockCard(
      dragHandle: widget.dragHandle,
      type: PopupMenuButton<LessonExerciseType>(
        initialValue: item.type,
        tooltip: l10n.exerciseLabel(item.type),
        onSelected: widget.onType,
        itemBuilder: (context) => [
          for (final type in LessonExerciseType.values)
            PopupMenuItem(value: type, child: Text(l10n.exerciseLabel(type))),
        ],
        child: _TypeChip(
          icon: exerciseTypeIcon(item.type),
          label: l10n.exerciseLabel(item.type),
        ),
      ),
      onDelete: widget.onDelete,
      deleteTooltip: l10n.deleteExercise,
      child: Column(
        children: [
          TextField(
            controller: _prompt,
            autofocus: widget.autofocus,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: l10n.cardFront),
            onChanged: (_) => _touch(),
          ),
          const SizedBox(height: 10),
          switch (item.type) {
            LessonExerciseType.flip || LessonExerciseType.type => TextField(
              controller: _answer,
              decoration: InputDecoration(labelText: l10n.cardBackLabel),
              onChanged: (_) => _touch(),
            ),
            LessonExerciseType.choice => _choiceEditor(l10n),
            LessonExerciseType.match => _matchEditor(l10n),
            LessonExerciseType.order => _orderEditor(l10n),
          },
        ],
      ),
    );
  }

  Widget _choiceEditor(L10n l10n) {
    return Column(
      children: [
        for (var i = 0; i < _options.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                IconButton(
                  tooltip: l10n.correctOption,
                  onPressed: () {
                    setState(() => _correct = i);
                    _touch();
                  },
                  icon: Icon(
                    i == _correct
                        ? Icons.check_circle_rounded
                        : Icons.circle_outlined,
                    color: i == _correct
                        ? context.ink.forest
                        : context.ink.inkMuted,
                  ),
                ),
                Expanded(
                  child: TextField(
                    controller: _options[i],
                    decoration: InputDecoration(
                      labelText: '${l10n.addOption} ${i + 1}',
                    ),
                    onChanged: (_) => _touch(),
                  ),
                ),
                IconButton(
                  onPressed: _options.length <= 1
                      ? null
                      : () {
                          setState(() {
                            final removedCorrect = _correct == i;
                            _options.removeAt(i).dispose();
                            if (removedCorrect) {
                              _correct = i.clamp(0, _options.length - 1);
                            } else if (i < _correct) {
                              _correct -= 1;
                            }
                          });
                          _touch();
                        },
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () {
              setState(() => _options.add(TextEditingController()));
            },
            icon: const Icon(Icons.add_rounded),
            label: Text(l10n.addOption),
          ),
        ),
      ],
    );
  }

  Widget _matchEditor(L10n l10n) {
    return Column(
      children: [
        for (var i = 0; i < _lefts.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _lefts[i],
                    decoration: InputDecoration(labelText: l10n.pairLeft),
                    onChanged: (_) => _touch(),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _rights[i],
                    decoration: InputDecoration(labelText: l10n.pairRight),
                    onChanged: (_) => _touch(),
                  ),
                ),
                IconButton(
                  onPressed: _lefts.length <= 1
                      ? null
                      : () {
                          setState(() {
                            _lefts.removeAt(i).dispose();
                            _rights.removeAt(i).dispose();
                          });
                          _touch();
                        },
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () {
              setState(() {
                _lefts.add(TextEditingController());
                _rights.add(TextEditingController());
              });
            },
            icon: const Icon(Icons.add_rounded),
            label: Text(l10n.addPair),
          ),
        ),
      ],
    );
  }

  Widget _orderEditor(L10n l10n) {
    return Column(
      children: [
        for (var i = 0; i < _items.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _items[i],
                    decoration: InputDecoration(labelText: '${i + 1}.'),
                    onChanged: (_) => _touch(),
                  ),
                ),
                IconButton(
                  tooltip: l10n.moveUp,
                  onPressed: i == 0
                      ? null
                      : () {
                          setState(() {
                            final item = _items.removeAt(i);
                            _items.insert(i - 1, item);
                          });
                          _touch();
                        },
                  icon: const Icon(Icons.keyboard_arrow_up_rounded),
                ),
                IconButton(
                  tooltip: l10n.moveDown,
                  onPressed: i >= _items.length - 1
                      ? null
                      : () {
                          setState(() {
                            final item = _items.removeAt(i);
                            _items.insert(i + 1, item);
                          });
                          _touch();
                        },
                  icon: const Icon(Icons.keyboard_arrow_down_rounded),
                ),
                IconButton(
                  onPressed: _items.length <= 1
                      ? null
                      : () {
                          setState(() => _items.removeAt(i).dispose());
                          _touch();
                        },
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () =>
                setState(() => _items.add(TextEditingController())),
            icon: const Icon(Icons.add_rounded),
            label: Text(l10n.addOrderItem),
          ),
        ),
      ],
    );
  }
}

class AddTypeChips extends StatelessWidget {
  const AddTypeChips({super.key, required this.items});

  final List<({IconData icon, String label, VoidCallback onTap})> items;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final item in items)
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: ActionChip(
              avatar: Icon(item.icon, size: 18),
              label: Text('+ ${item.label}'),
              onPressed: item.onTap,
            ),
          ),
      ],
    );
  }
}

class _BlockCard extends StatelessWidget {
  const _BlockCard({
    required this.dragHandle,
    required this.type,
    required this.onDelete,
    required this.deleteTooltip,
    required this.child,
  });

  final Widget dragHandle;
  final Widget type;
  final VoidCallback onDelete;
  final String deleteTooltip;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(6, 6, 6, 12),
        child: Column(
          children: [
            Row(
              children: [
                dragHandle,
                type,
                const Spacer(),
                IconButton(
                  tooltip: deleteTooltip,
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete_outline_rounded),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 0),
              child: child,
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
