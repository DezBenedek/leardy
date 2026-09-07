import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:leardy/app/app.dart';
import 'package:leardy/data/library_store.dart';
import 'package:leardy/data/local/database.dart';
import 'package:leardy/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final db = LeardyDatabase();
  final library = LibraryStore(db);
  await library.seedIfEmpty();
  await library.seedBundlesIfEmpty();
  runApp(
    ProviderScope(
      overrides: [
        databaseProvider.overrideWith((ref) {
          ref.onDispose(db.close);
          return db;
        }),
      ],
      child: const LeardyApp(),
    ),
  );
}
