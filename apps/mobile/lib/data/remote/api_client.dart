import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:leardy/domain/models.dart';

String defaultApiBase() {
  const override = String.fromEnvironment('API_BASE');
  if (override.isNotEmpty) return override;
  if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2:8787';
  return 'http://127.0.0.1:8787';
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

class UnauthorizedException extends ApiException {
  UnauthorizedException() : super('Unauthorized');
}

class ApiClient {
  ApiClient({String? baseUrl, String? token, this.onUnauthorized})
      : _dio = Dio(
          BaseOptions(
            baseUrl: baseUrl ?? defaultApiBase(),
            connectTimeout: const Duration(seconds: 20),
            sendTimeout: const Duration(seconds: 45),
            receiveTimeout: const Duration(seconds: 45),
            headers: {
              if (token != null) 'Authorization': 'Bearer $token',
            },
          ),
        );

  final Dio _dio;
  final VoidCallback? onUnauthorized;

  ApiClient withToken(String? token) =>
      ApiClient(baseUrl: _dio.options.baseUrl, token: token, onUnauthorized: onUnauthorized);

  Map<String, dynamic> _asMap(Object? value) {
    if (value is Map) return Map<String, dynamic>.from(value);
    throw ApiException('invalid_response');
  }

  List<dynamic> _asList(Object? value) {
    if (value is List) return value;
    throw ApiException('invalid_response');
  }

  String _asString(Object? value) {
    if (value is String && value.isNotEmpty) return value;
    throw ApiException('invalid_response');
  }

  Future<Map<String, dynamic>> _send(Future<Response<dynamic>> request) async {
    try {
      final response = await request;
      return _asMap(response.data);
    } on ApiException {
      rethrow;
    } on DioException catch (error) {
      if (error.response?.statusCode == 401) {
        onUnauthorized?.call();
        throw UnauthorizedException();
      }
      final data = error.response?.data;
      if (data is Map && data['error'] is String) {
        throw ApiException(data['error'] as String);
      }
      throw ApiException('server_unreachable');
    }
  }

  Future<void> health() => _send(_dio.get('/health'));

  Future<({String cursor, List<dynamic> accepted, List<dynamic> rejected, List<dynamic> skipped})> pushSync({
    required String deviceId,
    required List<Map<String, dynamic>> changes,
  }) async {
    final body = await _send(_dio.post('/v1/sync/push', data: {'deviceId': deviceId, 'changes': changes}));
    return (
      cursor: body['cursor'] as String? ?? '',
      accepted: body['accepted'] is List ? body['accepted'] as List : const [],
      rejected: body['rejected'] is List ? body['rejected'] as List : const [],
      skipped: body['skipped'] is List ? body['skipped'] as List : const [],
    );
  }

  Future<({String cursor, List<Map<String, dynamic>> changes})> pullSync({String? cursor}) async {
    final body = await _send(
      _dio.get('/v1/sync/pull', queryParameters: {if (cursor != null && cursor.isNotEmpty) 'cursor': cursor}),
    );
    final raw = body['changes'] is List ? body['changes'] as List : const [];
    return (
      cursor: body['cursor'] as String? ?? cursor ?? '',
      changes: [
        for (final item in raw)
          if (item is Map) Map<String, dynamic>.from(item),
      ],
    );
  }

  Future<({String token, AuthUser user})> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final body = await _send(_dio.post('/auth/register', data: {'name': name, 'email': email, 'password': password}));
    return (token: _asString(body['token']), user: _user(body['user']));
  }

  Future<({String token, AuthUser user})> login({required String email, required String password}) async {
    final body = await _send(_dio.post('/auth/login', data: {'email': email, 'password': password}));
    return (token: _asString(body['token']), user: _user(body['user']));
  }

  Future<void> logout() => _send(_dio.post('/auth/logout'));

  Future<AuthUser> me() async {
    final body = await _send(_dio.get('/auth/me'));
    return _user(body['user']);
  }

  Future<AuthUser> patchMe({
    String? name,
    String? email,
    String? currentPassword,
    String? newPassword,
    bool? isTeacher,
  }) async {
    final body = await _send(
      _dio.patch('/auth/me', data: {
        if (name != null) 'name': name,
        if (email != null) 'email': email,
        if (currentPassword != null) 'currentPassword': currentPassword,
        if (newPassword != null) 'newPassword': newPassword,
        if (isTeacher != null) 'isTeacher': isTeacher,
      }),
    );
    return _user(body['user']);
  }

  Future<List<Classroom>> classes() async {
    final body = await _send(_dio.get('/classes'));
    return [for (final raw in _asList(body['classes'])) if (raw is Map) _class(raw)];
  }

  Future<Classroom> createClass(String name) async {
    final body = await _send(_dio.post('/classes', data: {'name': name}));
    return _class(_asMap(body['class']));
  }

  Future<Classroom> joinClass(String joinCode) async {
    final body = await _send(_dio.post('/classes/join', data: {'joinCode': joinCode}));
    return _class(_asMap(body['class']));
  }

  Future<Classroom> classDetail(String id) async {
    final body = await _send(_dio.get('/classes/$id'));
    return _class(_asMap(body['class']));
  }

  Future<Classroom> patchClass(String id, {bool? allowStudentSets, String? name}) async {
    final body = await _send(
      _dio.patch('/classes/$id', data: {
        if (allowStudentSets != null) 'allowStudentSets': allowStudentSets,
        if (name != null) 'name': name,
      }),
    );
    return _class(_asMap(body['class']));
  }

  Future<void> kickMember(String classId, String userId) async {
    await _send(_dio.delete('/classes/$classId/members/$userId'));
  }

  Future<void> banMember(String classId, String userId) async {
    await _send(_dio.post('/classes/$classId/members/$userId/ban'));
  }

  Future<void> unbanMember(String classId, String userId) async {
    await _send(_dio.delete('/classes/$classId/bans/$userId'));
  }

  Future<void> patchMemberRole(String classId, String userId, String role) async {
    await _send(_dio.patch('/classes/$classId/members/$userId', data: {'role': role}));
  }

  Future<List<ClassMaterial>> classMaterials(String classId) async {
    final body = await _send(_dio.get('/classes/$classId/materials'));
    return [for (final raw in _asList(body['materials'])) if (raw is Map) _material(raw)];
  }

  Future<ClassMaterial> addMaterial({
    required String classId,
    required String title,
    String? url,
    String? note,
  }) async {
    final body = await _send(
      _dio.post('/classes/$classId/materials', data: {'title': title, 'url': url, 'note': note}),
    );
    return _material(_asMap(body['material']));
  }

  Future<ClassMaterial> patchMaterial({
    required String classId,
    required String materialId,
    required String title,
    String? url,
    String? note,
  }) async {
    final body = await _send(
      _dio.patch('/classes/$classId/materials/$materialId', data: {'title': title, 'url': url, 'note': note}),
    );
    return _material(_asMap(body['material']));
  }

  Future<void> deleteMaterial(String classId, String materialId) async {
    await _send(_dio.delete('/classes/$classId/materials/$materialId'));
  }

  Future<List<ClassSet>> classSets(String classId) async {
    final body = await _send(_dio.get('/classes/$classId/sets'));
    return [for (final raw in _asList(body['sets'])) if (raw is Map) _classSet(raw)];
  }

  Future<({ClassSet set, List<ClassCard> cards})> classSet(String classId, String setId) async {
    final body = await _send(_dio.get('/classes/$classId/sets/$setId'));
    final set = _asMap(body['set']);
    final cards = [
      for (final raw in _asList(set['cards']))
        if (raw is Map)
          ClassCard(
            front: raw['front'] as String? ?? '',
            back: raw['back'] as String? ?? '',
            hint: raw['hint'] as String?,
            example: raw['example'] as String?,
          ),
    ];
    return (
      set: _classSet(set),
      cards: cards,
    );
  }

  Future<List<SetEditor>> setEditors(String classId, String setId) async {
    final body = await _send(_dio.get('/classes/$classId/sets/$setId/editors'));
    return [
      for (final raw in _asList(body['editors']))
        if (raw is Map)
          SetEditor(
            userId: raw['userId'] as String? ?? '',
            username: raw['username'] as String? ?? '',
            email: raw['email'] as String?,
          ),
    ];
  }

  Future<void> addSetEditor(String classId, String setId, String email) async {
    await _send(_dio.post('/classes/$classId/sets/$setId/editors', data: {'email': email}));
  }

  Future<void> removeSetEditor(String classId, String setId, String userId) async {
    await _send(_dio.delete('/classes/$classId/sets/$setId/editors/$userId'));
  }

  Future<String> publishSet({
    required String classId,
    required String name,
    required String subject,
    required List<ClassCard> cards,
  }) async {
    final body = await _send(
      _dio.post(
        '/classes/$classId/sets',
        data: {
          'name': name,
          'subject': subject,
          'cards': [
            for (final card in cards) {'front': card.front, 'back': card.back, 'hint': card.hint, 'example': card.example},
          ],
        },
      ),
    );
    return _asString(_asMap(body['set'])['id']);
  }

  Future<List<Map<String, dynamic>>> publicBundles() async {
    final body = await _send(_dio.get('/bundles/public'));
    return [for (final raw in _asList(body['bundles'])) if (raw is Map) Map<String, dynamic>.from(raw)];
  }

  Future<Map<String, dynamic>?> bundle(String id) async {
    try {
      final body = await _send(_dio.get('/bundles/$id'));
      final raw = body['bundle'];
      if (raw is Map) return Map<String, dynamic>.from(raw);
      return null;
    } on ApiException {
      return null;
    }
  }

  Future<void> unpublishBundle(String id) async {
    await _send(_dio.patch('/bundles/$id', data: {'status': 'draft'}));
  }

  Future<void> patchBundleStatus(String id, String status) async {
    await _send(_dio.patch('/bundles/$id', data: {'status': status}));
  }

  Future<Map<String, dynamic>> publishBundle(Map<String, dynamic> snapshot) async {
    final body = await _send(_dio.post('/bundles', data: snapshot));
    return Map<String, dynamic>.from(_asMap(body['bundle']));
  }

  Future<void> saveRemoteBundle(String bundleId) async {
    await _send(_dio.post('/bundles/$bundleId/save'));
  }

  Future<void> unsaveRemoteBundle(String bundleId) async {
    await _send(_dio.delete('/bundles/$bundleId/save'));
  }

  Future<List<Map<String, dynamic>>> classBundles(String classId) async {
    final body = await _send(_dio.get('/classes/$classId/bundles'));
    return [for (final raw in _asList(body['bundles'])) if (raw is Map) Map<String, dynamic>.from(raw)];
  }

  Future<({Map<String, dynamic>? bundle, String? quizSetId})> assignBundle({
    required String classId,
    required String bundleId,
    Map<String, dynamic>? snapshot,
  }) async {
    final body = await _send(
      _dio.post('/classes/$classId/bundles', data: {'bundleId': bundleId, ...?snapshot}),
    );
    return (
      bundle: body['bundle'] is Map ? Map<String, dynamic>.from(body['bundle'] as Map) : null,
      quizSetId: body['quizSetId'] as String?,
    );
  }

  Future<String> startQuiz(
    String classId,
    String setId, {
    String pace = 'teacher',
    int seconds = 30,
    String questionMode = 'choice',
  }) async {
    final body = await _send(
      _dio.post(
        '/classes/$classId/quiz/start',
        data: {'setId': setId, 'pace': pace, 'seconds': seconds, 'questionMode': questionMode},
      ),
    );
    return _asString(_asMap(body['session'])['id']);
  }

  /// Könnyű poll élő doga-meghívókhoz (a nehéz classes() helyett).
  Future<List<QuizInvite>> liveQuizzes() async {
    final body = await _send(_dio.get('/classes/live'));
    return [
      for (final raw in _asList(body['live']))
        if (raw is Map)
          QuizInvite(
            classId: raw['classId'] as String? ?? '',
            className: raw['className'] as String? ?? '',
            sessionId: raw['sessionId'] as String? ?? '',
            status: raw['status'] as String? ?? '',
          ),
    ];
  }

  Future<({String id, String status})?> activeQuiz(String classId) async {
    final body = await _send(_dio.get('/classes/$classId/quiz/active'));
    final session = body['session'];
    if (session is! Map) return null;
    return (id: session['id'] as String, status: session['status'] as String? ?? 'LOBBY');
  }

  Future<Map<String, dynamic>> quizSnapshot(String sessionId) async {
    final body = await _send(_dio.get('/quiz/$sessionId'));
    return Map<String, dynamic>.from(_asMap(body['snapshot']));
  }

  String wsUrl(String sessionId, String token) {
    final base = _dio.options.baseUrl.replaceFirst(RegExp(r'^http'), 'ws');
    return '$base/quiz/$sessionId/ws?token=${Uri.encodeQueryComponent(token)}';
  }

  AuthUser _user(dynamic raw) {
    final map = _asMap(raw);
    return AuthUser(
      id: _asString(map['id']),
      username: _asString(map['username']),
      email: map['email'] as String?,
      isTeacher: map['isTeacher'] == true,
    );
  }

  Classroom _class(Map raw) {
    return Classroom(
      id: raw['id'] as String,
      name: raw['name'] as String,
      role: raw['role'] as String? ?? 'student',
      allowStudentSets: raw['allowStudentSets'] == true,
      memberCount: (raw['memberCount'] as num?)?.toInt() ?? (raw['members'] as List?)?.length ?? 0,
      ownerId: raw['ownerId'] as String?,
      joinCode: raw['joinCode'] as String?,
      activeQuizId: raw['activeQuizId'] as String?,
      activeQuizStatus: raw['activeQuizStatus'] as String?,
      members: [
        for (final item in raw['members'] as List? ?? const [])
          if (item is Map) _member(item),
      ],
      banned: [
        for (final item in raw['banned'] as List? ?? const [])
          if (item is Map) _member(item, fallbackRole: 'banned'),
      ],
    );
  }

  ClassMember _member(Map raw, {String fallbackRole = 'student'}) {
    return ClassMember(
      userId: raw['userId'] as String,
      username: raw['username'] as String? ?? '',
      role: raw['role'] as String? ?? fallbackRole,
      joinedAt: raw['joinedAt'] as String? ?? raw['createdAt'] as String?,
    );
  }

  Future<void> deleteClassSet(String classId, String setId) async {
    await _send(_dio.delete('/classes/$classId/sets/$setId'));
  }

  Future<void> unassignBundle(String classId, String bundleId) async {
    await _send(_dio.delete('/classes/$classId/bundles/$bundleId'));
  }

  ClassSet _classSet(Map raw) {
    return ClassSet(
      id: raw['id'] as String,
      name: raw['name'] as String,
      subject: raw['subject'] as String,
      ownerId: raw['ownerId'] as String?,
      myRole: raw['myRole'] as String? ?? 'reader',
      createdAt: raw['createdAt'] as String?,
    );
  }

  ClassMaterial _material(Map raw) {
    return ClassMaterial(
      id: raw['id'] as String,
      title: raw['title'] as String,
      url: raw['url'] as String?,
      note: raw['note'] as String?,
      createdBy: raw['createdBy'] as String?,
      createdAt: raw['createdAt'] as String?,
    );
  }
}
