import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

class ReminderService {
  ReminderService._();

  static final ReminderService instance = ReminderService._();

  final _plugin = FlutterLocalNotificationsPlugin();
  var _ready = false;

  static const _id = 1001;
  static const _channelId = 'leardy_daily';
  static const _channelName = 'Napi emlékeztető';

  static String titleFor(String locale) {
    return switch (locale) {
      'en' => 'Time to practice',
      'de' => 'Zeit zum Üben',
      'it' => 'Ora di esercitarti',
      'es' => 'Hora de practicar',
      _ => 'Ideje gyakorolni',
    };
  }

  static String bodyFor(String locale) {
    return switch (locale) {
      'en' => 'Your daily streak is waiting.',
      'de' => 'Deine Serie wartet auf dich.',
      'it' => 'La tua serie ti aspetta.',
      'es' => 'Tu racha te espera.',
      _ => 'A napi sorozatod vár.',
    };
  }

  Future<void> init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    try {
      final info = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(info.identifier));
    } catch (_) {
      tz.setLocalLocation(tz.getLocation('Europe/Budapest'));
    }
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwin = DarwinInitializationSettings();
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: android,
        iOS: darwin,
        macOS: darwin,
      ),
    );
    _ready = true;
  }

  Future<bool> requestPermission() async {
    await init();
    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    var granted = true;
    if (android != null) {
      final notifications = await android.requestNotificationsPermission();
      granted = notifications ?? true;
    }
    final ios = _plugin.resolvePlatformSpecificImplementation<
      IOSFlutterLocalNotificationsPlugin
    >();
    if (ios != null) {
      final result = await ios.requestPermissions(alert: true, badge: true, sound: true);
      granted = granted && (result ?? true);
    }
    final mac = _plugin.resolvePlatformSpecificImplementation<
      MacOSFlutterLocalNotificationsPlugin
    >();
    if (mac != null) {
      final result = await mac.requestPermissions(alert: true, badge: true, sound: true);
      granted = granted && (result ?? true);
    }
    return granted;
  }

  tz.TZDateTime _nextDaily(int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    var next = tz.TZDateTime(
      tz.local,
      now.year,
      now.month,
      now.day,
      hour,
      minute,
    );
    if (!next.isAfter(now)) {
      next = next.add(const Duration(days: 1));
    }
    return next;
  }

  Future<void> scheduleDaily({
    required int hour,
    required int minute,
    String locale = 'hu',
  }) async {
    await init();
    await cancel();
    final details = NotificationDetails(
      android: const AndroidNotificationDetails(
        _channelId,
        _channelName,
        importance: Importance.defaultImportance,
        priority: Priority.defaultPriority,
      ),
      iOS: const DarwinNotificationDetails(),
      macOS: const DarwinNotificationDetails(),
    );
    await _plugin.zonedSchedule(
      id: _id,
      title: titleFor(locale),
      body: bodyFor(locale),
      scheduledDate: _nextDaily(hour, minute),
      notificationDetails: details,
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
    );
  }

  Future<void> cancel() async {
    try {
      await _plugin.cancel(id: _id);
    } catch (_) {}
  }
}
