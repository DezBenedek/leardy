import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:leardy/design_system/components/knowledge_signal.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/domain/srs.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';

class CardSearchPage extends ConsumerStatefulWidget {
  const CardSearchPage({super.key});

  @override
  ConsumerState<CardSearchPage> createState() => _CardSearchPageState();
}

class _CardSearchPageState extends ConsumerState<CardSearchPage> {
  final _search = TextEditingController();
  Timer? _debounce;
  List<({CardView card, String deckId, String deckName})> _results = [];
  var _searched = false;
  var _busy = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _run(value));
  }

  Future<void> _run(String value) async {
    if (value.trim().isEmpty) {
      if (mounted) {
        setState(() {
          _results = [];
          _searched = false;
        });
      }
      return;
    }
    setState(() => _busy = true);
    final results = await ref.read(libraryProvider).searchCards(value);
    if (!mounted) return;
    setState(() {
      _results = results;
      _searched = true;
      _busy = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.searchCards)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: _search,
              autofocus: true,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: l10n.searchCardsHint,
              ),
              onChanged: _onChanged,
              onSubmitted: _run,
            ),
          ),
          if (_busy) const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: !_searched
                ? const SizedBox.shrink()
                : _results.isEmpty
                ? Center(child: Text(l10n.noCardsFound))
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                    itemCount: _results.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final entry = _results[index];
                      final card = entry.card;
                      final levelKey = levelKeyFor(card.level);
                      return AppCard(
                        onTap: () => context.push('/kartyak/${entry.deckId}'),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        child: ListTile(
                          title: Text(card.front),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(card.back),
                              const SizedBox(height: 2),
                              Text(
                                entry.deckName,
                                style: Theme.of(context).textTheme.labelSmall
                                    ?.copyWith(color: context.ink.inkMuted),
                              ),
                            ],
                          ),
                          trailing: Tooltip(
                            message: l10n.knowledgeLevelLabel(levelKey),
                            child: KnowledgeSignal(level: card.level),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
