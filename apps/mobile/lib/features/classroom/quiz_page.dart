import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:leardy/design_system/sheets.dart';
import 'package:leardy/design_system/theme/leardy_ink.dart';
import 'package:leardy/design_system/toast.dart';
import 'package:leardy/l10n/l10n.dart';
import 'package:leardy/providers.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class QuizPage extends ConsumerStatefulWidget {
  const QuizPage({super.key, required this.classId, required this.sessionId, this.teacherHint = false});

  final String classId;
  final String sessionId;
  final bool teacherHint;

  @override
  ConsumerState<QuizPage> createState() => _QuizPageState();
}

class _LiveAnswer {
  const _LiveAnswer({required this.userId, required this.name, required this.text, required this.correct});

  final String userId;
  final String name;
  final String text;
  final bool correct;
}

class _Person {
  const _Person({required this.userId, required this.name, required this.teacher});

  final String userId;
  final String name;
  final bool teacher;
}

class _QuizPageState extends ConsumerState<QuizPage> {
  WebSocketChannel? _channel;
  Timer? _reconnectTimer;
  bool _closed = false;
  String _phase = 'LOBBY';
  String _kind = 'choice';
  String? _prompt;
  List<String> _choices = [];
  int? _correct;
  String? _expected;
  int _questionIndex = -1;
  int _questionCount = 0;
  List<_Person> _people = [];
  List<_LiveAnswer> _answers = [];
  String? _error;
  final _typed = TextEditingController();
  bool _submitted = false;
  bool? _isTeacher;
  bool _ready = false;
  bool _missingToken = false;
  int _reconnectAttempt = 0;
  int? _deadlineAt;
  Timer? _ticker;
  List<({String name, int points})> _scores = [];

  bool get _teacher => _isTeacher == true;

  @override
  void initState() {
    super.initState();
    _isTeacher = widget.teacherHint ? true : null;
    _connect();
  }

  @override
  void dispose() {
    _closed = true;
    _reconnectTimer?.cancel();
    _ticker?.cancel();
    _typed.dispose();
    final channel = _channel;
    _channel = null;
    channel?.sink.close();
    super.dispose();
  }

  void _startTicker() {
    _ticker?.cancel();
    if (_deadlineAt == null) return;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  int? get _remainingSeconds {
    final deadline = _deadlineAt;
    if (deadline == null) return null;
    return max(0, ((deadline - DateTime.now().millisecondsSinceEpoch) / 1000).ceil());
  }

  Future<void> _connect() async {
    if (_closed) return;
    final auth = ref.read(authProvider);
    final token = auth.token;
    if (token == null) {
      if (mounted) setState(() => _missingToken = true);
      return;
    }
    try {
      // A tanár-szerepet csak egyszer kérdezzük le: újracsatlakozáskor
      // nem spammeljük újra a teljes osztálylistát.
      if (_isTeacher == null) {
        final classes = await ref.read(authProvider.notifier).client.classes();
        if (!mounted || _closed) return;
        final teacher = classes.any((c) => c.id == widget.classId && c.isTeacher);
        setState(() => _isTeacher = teacher);
      }
      _channel?.sink.close();
      final url = ref.read(authProvider.notifier).client.wsUrl(widget.sessionId, token);
      final channel = WebSocketChannel.connect(Uri.parse(url));
      _channel = channel;
      channel.stream.listen(
        _onMessage,
        onError: (Object error) {
          if (_channel != channel) return;
          if (mounted) {
            setState(() => _error = '$error');
            showAppToast(context, L10n.of(context).apiError('$error'));
          }
          _scheduleReconnect();
        },
        onDone: () {
          if (_channel == channel) _scheduleReconnect();
        },
      );
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString());
        showAppToast(context, L10n.of(context).apiError(error.toString()));
      }
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_closed || !mounted || _missingToken) return;
    _reconnectTimer?.cancel();
    final delay = Duration(milliseconds: min(8000, 500 * (1 << _reconnectAttempt.clamp(0, 4))));
    _reconnectAttempt += 1;
    _reconnectTimer = Timer(delay, () {
      if (!_closed && mounted) _connect();
    });
  }

  void _onMessage(dynamic raw) {
    if (!mounted || raw is! String) return;
    Map<String, dynamic> data;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      data = Map<String, dynamic>.from(decoded);
    } catch (_) {
      return;
    }
    setState(() {
      _ready = true;
      _reconnectAttempt = 0;
      if (data['type'] == 'error') {
        _error = data['error'] as String?;
        _submitted = false;
        if (_error != null) showAppToast(context, L10n.of(context).apiError(_error!));
      }
      if (data['type'] == 'answer_ack') {
        _submitted = true;
      }
      if (data['phase'] is String) _phase = data['phase'] as String;
      if (data['questionIndex'] is num) _questionIndex = (data['questionIndex'] as num).toInt();
      if (data['questionCount'] is num) _questionCount = (data['questionCount'] as num).toInt();
      _applyScores(data['scores'] as List?);
      if (data['type'] == 'snapshot' || data['type'] == 'presence' || data['type'] == 'progress') {
        _applyPeople(data['participants'] as List?);
        if (data['phase'] is String) _phase = data['phase'] as String;
        final question = data['question'] as Map?;
        if (question != null) {
          _prompt = question['prompt'] as String?;
          _kind = question['kind'] as String? ?? 'choice';
          _choices = (question['choices'] as List? ?? []).cast<String>();
          _correct = question['correctIndex'] as int?;
          _expected = question['expected'] as String?;
          _deadlineAt = (question['deadlineAt'] as num?)?.toInt();
          _startTicker();
        }
        _applyResults(data['results'] as Map?);
        _applyScores(data['scores'] as List?);
      }
      if (data['type'] == 'question') {
        _prompt = data['prompt'] as String?;
        _kind = data['kind'] as String? ?? 'choice';
        _choices = (data['choices'] as List? ?? []).cast<String>();
        _deadlineAt = (data['deadlineAt'] as num?)?.toInt();
        _startTicker();
        if (!_teacher) {
          _correct = null;
          _expected = null;
        }
        _answers = [];
        _submitted = false;
        _typed.clear();
        _phase = 'QUESTION_OPEN';
      }
      if (data['type'] == 'results') {
        _correct = data['correctIndex'] as int?;
        _expected = data['expected'] as String?;
        _applyResults(data);
        _phase = 'RESULTS_SHOWN';
      }
      if (data['type'] == 'phase' && data['phase'] is String) {
        _phase = data['phase'] as String;
      }
      if (data['type'] == 'finished') {
        _phase = 'FINISHED';
        _applyScores(data['scores'] as List?);
      }
    });
  }

  void _applyScores(List? raw) {
    if (raw == null) return;
    _scores = [
      for (final item in raw)
        if (item is Map)
          (name: '${item['displayName'] ?? item['userId']}', points: (item['points'] as num?)?.toInt() ?? 0),
    ];
  }

  void _applyPeople(List? raw) {
    if (raw == null) return;
    _people = raw.map((p) {
      final map = p as Map;
      return _Person(
        userId: '${map['userId']}',
        name: '${map['displayName']}',
        teacher: map['role'] == 'teacher',
      );
    }).toList();
  }

  void _applyResults(Map? raw) {
    if (raw == null) return;
    final answers = raw['answers'] as List? ?? [];
    _answers = answers.map((item) {
      final map = item as Map;
      final choice = map['choice'] as int? ?? -1;
      final typed = map['typed'] as String?;
      final text = (typed != null && typed.isNotEmpty)
          ? typed
          : (choice >= 0 && choice < _choices.length ? _choices[choice] : '—');
      return _LiveAnswer(
        userId: '${map['userId']}',
        name: '${map['displayName'] ?? map['userId']}',
        text: text,
        correct: map['correct'] == true,
      );
    }).toList();
    if (raw['correctIndex'] is int) _correct = raw['correctIndex'] as int;
    if (raw['expected'] is String) _expected = raw['expected'] as String;
  }

  void _send(Map<String, dynamic> body) {
    _channel?.sink.add(jsonEncode(body));
  }

  List<_Person> get _students => _people.where((p) => !p.teacher).toList();

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    if (_missingToken) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.quiz)),
        body: Center(child: Text(l10n.loginForClassroom)),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(_teacher ? l10n.quizHost : l10n.quiz),
      ),
      body: !_ready && _error == null
          ? const Center(child: CircularProgressIndicator())
          : _teacher
              ? _teacherBody(l10n)
              : _studentBody(l10n),
    );
  }

  Widget _teacherBody(L10n l10n) {
    final ink = context.ink;
    final waiting = _students.where((s) => !_answers.any((a) => a.userId == s.userId)).toList();
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              Row(
                children: [
                  Chip(label: Text(l10n.quizPhase(_phase))),
                  const Spacer(),
                  if (_remainingSeconds != null) Text(l10n.secondsLeft(_remainingSeconds!)),
                  if (_questionCount > 0) Text('  ${_questionIndex + 1} / $_questionCount'),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _students.isEmpty ? l10n.waiting : l10n.answeredCount(_answers.length, _students.length),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 14),
              if (_prompt != null) Text(_prompt!, style: Theme.of(context).textTheme.headlineMedium),
              if (_kind == 'type' && _expected != null) ...[
                const SizedBox(height: 8),
                Text('${l10n.cardAnswer}: $_expected', style: Theme.of(context).textTheme.bodyMedium),
              ],
              if (_choices.isNotEmpty) ...[
                const SizedBox(height: 12),
                for (var i = 0; i < _choices.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: AppCard(
                      child: Row(
                        children: [
                          Expanded(child: Text(_choices[i])),
                          Text('${_answers.where((a) => a.text == _choices[i]).length}'),
                          if (_correct == i) ...[
                            const SizedBox(width: 8),
                            Icon(Icons.check_rounded, color: ink.forest, size: 18),
                          ],
                        ],
                      ),
                    ),
                  ),
              ],
              const SizedBox(height: 16),
              Text(l10n.members, style: Theme.of(context).textTheme.labelSmall),
              const SizedBox(height: 8),
              if (_students.isEmpty) Text(l10n.waiting),
              for (final student in _students)
                _studentRow(
                  student,
                  _answers.where((a) => a.userId == student.userId).firstOrNull,
                  ink,
                ),
              if (waiting.isNotEmpty && _phase == 'QUESTION_OPEN') ...[
                const SizedBox(height: 8),
                Text(l10n.waitingToAnswer, style: Theme.of(context).textTheme.bodyMedium),
              ],
              if (_scores.isNotEmpty) ...[
                const SizedBox(height: 16),
                for (final score in _scores) Text('${score.name}: ${l10n.quizPoints(score.points)}'),
              ],
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: _teacherButtons(l10n),
          ),
        ),
      ],
    );
  }

  Widget _studentRow(_Person student, _LiveAnswer? answer, LeardyInk ink) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(student.name),
      subtitle: Text(answer?.text ?? '…'),
      trailing: answer == null
          ? Text(L10n.of(context).waitingShort)
          : Icon(
              answer.correct ? Icons.check_circle_rounded : Icons.cancel_rounded,
              color: answer.correct ? ink.forest : ink.wine,
            ),
    );
  }

  Widget _teacherButtons(L10n l10n) {
    if (_phase == 'FINISHED') {
      return SizedBox(
        height: 56,
        width: double.infinity,
        child: FilledButton(onPressed: () => Navigator.maybePop(context), child: Text(l10n.quizOver)),
      );
    }
    if (_phase == 'LOBBY' || _phase == 'QUIZ_READY') {
      return SizedBox(
        height: 56,
        width: double.infinity,
        child: FilledButton(onPressed: () => _send({'type': 'next'}), child: Text(l10n.quizStart)),
      );
    }
    if (_phase == 'QUESTION_OPEN') {
      return Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 56,
              child: OutlinedButton(onPressed: () => _send({'type': 'pause'}), child: Text(l10n.quizPause)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 56,
              child: FilledButton(onPressed: () => _send({'type': 'next'}), child: Text(l10n.quizNext)),
            ),
          ),
        ],
      );
    }
    if (_phase == 'QUESTION_CLOSED') {
      return Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 56,
              child: OutlinedButton(onPressed: () => _send({'type': 'resume'}), child: Text(l10n.quizResume)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 56,
              child: FilledButton(onPressed: () => _send({'type': 'next'}), child: Text(l10n.quizNext)),
            ),
          ),
        ],
      );
    }
    return Row(
      children: [
        Expanded(
          child: SizedBox(
            height: 56,
            child: OutlinedButton(onPressed: () => _send({'type': 'end_quiz'}), child: Text(l10n.quizEnd)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: SizedBox(
            height: 56,
            child: FilledButton(onPressed: () => _send({'type': 'next'}), child: Text(l10n.quizNext)),
          ),
        ),
      ],
    );
  }

  Widget _studentBody(L10n l10n) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Chip(label: Text(l10n.quizPhase(_phase))),
        if (_remainingSeconds != null) ...[
          const SizedBox(height: 8),
          Text(l10n.secondsLeft(_remainingSeconds!)),
        ],
        const SizedBox(height: 8),
        Text(_students.isEmpty ? l10n.waiting : l10n.people(_students.length)),
        const SizedBox(height: 18),
        if (_prompt != null) Text(_prompt!, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 16),
        if (_kind == 'type' && _phase == 'QUESTION_OPEN') ...[
          TextField(
            controller: _typed,
            enabled: !_submitted,
            decoration: InputDecoration(labelText: l10n.yourAnswer),
            onSubmitted: (_) => _submitTyped(),
          ),
          const SizedBox(height: 10),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: _submitted ? null : _submitTyped,
            child: Text(l10n.submitAnswer),
          ),
        ] else if (_phase == 'QUESTION_OPEN')
          for (var i = 0; i < _choices.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed: _submitted ? null : () => _pick(i),
                child: Text(_choices[i]),
              ),
            ),
        if (_phase == 'RESULTS_SHOWN') ...[
          if (_expected != null) Text(_expected!),
          if (_correct != null && _correct! < _choices.length) Text(_choices[_correct!]),
        ],
        if (_scores.isNotEmpty) ...[
          const SizedBox(height: 12),
          for (final score in _scores) Text('${score.name}: ${l10n.quizPoints(score.points)}'),
        ],
        if (_phase == 'FINISHED') ...[
          const SizedBox(height: 12),
          Text(l10n.quizOver),
        ],
        if (_questionCount > 0) Text('${_questionIndex + 1} / $_questionCount'),
      ],
    );
  }

  void _pick(int i) {
    if (_phase != 'QUESTION_OPEN' || _teacher || _submitted) return;
    setState(() => _submitted = true);
    _send({'type': 'answer', 'questionIndex': _questionIndex, 'choice': i});
  }

  void _submitTyped() {
    if (_phase != 'QUESTION_OPEN' || _teacher || _submitted) return;
    setState(() => _submitted = true);
    _send({'type': 'answer', 'questionIndex': _questionIndex, 'typed': _typed.text});
  }
}
