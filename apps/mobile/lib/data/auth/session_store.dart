import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SessionStore {
  static const _blobKey = 'leardy.session.v2';
  static const _tokenKey = 'leardy.session';
  static const _userKey = 'leardy.username';
  static const _idKey = 'leardy.userId';
  static const _emailKey = 'leardy.email';
  static const _teacherKey = 'leardy.isTeacher';

  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  Future<String?> token() async {
    try {
      final blob = await _readBlob();
      if (blob != null) return blob['token'];
      return await _storage.read(key: _tokenKey).timeout(const Duration(seconds: 2));
    } catch (_) {
      return null;
    }
  }

  Future<({String id, String username, String? email, bool isTeacher})?> user() async {
    try {
      final blob = await _readBlob();
      if (blob != null) {
        final id = blob['id'];
        final username = blob['username'];
        if (id == null || username == null) return null;
        return (
          id: id,
          username: username,
          email: blob['email'],
          isTeacher: blob['isTeacher'] == 'true' || blob['isTeacher'] == '1',
        );
      }
      final id = await _storage.read(key: _idKey).timeout(const Duration(seconds: 2));
      final username = await _storage.read(key: _userKey).timeout(const Duration(seconds: 2));
      if (id == null || username == null) return null;
      return (
        id: id,
        username: username,
        email: await _storage.read(key: _emailKey).timeout(const Duration(seconds: 2)),
        isTeacher: await _storage.read(key: _teacherKey).timeout(const Duration(seconds: 2)) == '1',
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> save({
    required String token,
    required String id,
    required String username,
    String? email,
    bool isTeacher = false,
  }) async {
    try {
      await _storage.write(
        key: _blobKey,
        value: jsonEncode({
          'token': token,
          'id': id,
          'username': username,
          'email': email,
          'isTeacher': isTeacher,
        }),
      );
    } catch (_) {
      await clear();
      rethrow;
    }
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _blobKey);
      await _storage.delete(key: _tokenKey);
      await _storage.delete(key: _idKey);
      await _storage.delete(key: _userKey);
      await _storage.delete(key: _emailKey);
      await _storage.delete(key: _teacherKey);
    } catch (_) {}
  }

  Future<Map<String, String?>?> _readBlob() async {
    final raw = await _storage.read(key: _blobKey).timeout(const Duration(seconds: 2));
    if (raw == null || raw.isEmpty) return null;
    final decoded = jsonDecode(raw);
    if (decoded is! Map) return null;
    return {
      'token': decoded['token'] as String?,
      'id': decoded['id'] as String?,
      'username': decoded['username'] as String?,
      'email': decoded['email'] as String?,
      'isTeacher': decoded['isTeacher']?.toString(),
    };
  }
}
