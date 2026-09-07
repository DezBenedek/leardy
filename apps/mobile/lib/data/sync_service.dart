import 'dart:developer' as developer;

import 'package:leardy/data/library_store.dart';
import 'package:leardy/data/remote/api_client.dart';
import 'package:uuid/uuid.dart';

class SyncService {
  SyncService(this._library);

  final LibraryStore _library;
  final _uuid = const Uuid();
  Future<void>? _inFlight;

  Future<void> sync(ApiClient client) {
    return _inFlight ??= _run(client).whenComplete(() => _inFlight = null);
  }

  Future<void> _run(ApiClient client) async {
    var deviceId = await _library.setting('deviceId');
    if (deviceId.isEmpty) {
      deviceId = _uuid.v4();
      await _library.setSetting('deviceId', deviceId);
    }
    final cursor = await _library.setting('syncCursor');
    final outgoing = await _library.exportChanges();
    if (outgoing.isNotEmpty) {
      final pushed = await client.pushSync(deviceId: deviceId, changes: outgoing);
      await _library.markAccepted(pushed.accepted);
      if (pushed.rejected.isNotEmpty) {
        developer.log('sync rejected ${pushed.rejected.length}', name: 'leardy.sync');
      }
      await _library.clearOutbox();
    }
    final incoming = await client.pullSync(cursor: cursor.isEmpty ? null : cursor);
    if (incoming.changes.isNotEmpty) {
      await _library.applyRemoteChanges(incoming.changes);
    }
    if (incoming.cursor.isNotEmpty) {
      await _library.setSetting('syncCursor', incoming.cursor);
    }
    await _library.setSetting('lastSyncAt', DateTime.now().toIso8601String());
  }
}
