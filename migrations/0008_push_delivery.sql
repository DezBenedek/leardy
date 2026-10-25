-- Tartós push kézbesítés, ötperces újrapróbálás.
ALTER TABLE notification_prefs ADD COLUMN reminder INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notification_prefs ADD COLUMN reminder_time TEXT NOT NULL DEFAULT '20:00';
ALTER TABLE notification_prefs ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'Europe/Budapest';
ALTER TABLE notification_prefs ADD COLUMN due_soon INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS push_deliveries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 endpoint TEXT NOT NULL REFERENCES push_subscriptions(endpoint) ON DELETE CASCADE,
 event_key TEXT NOT NULL, kind TEXT NOT NULL, classroom_id TEXT NOT NULL DEFAULT '',
 payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 next_attempt_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 delivered_at INTEGER, lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 UNIQUE(endpoint, event_key)
);
CREATE INDEX IF NOT EXISTS idx_push_delivery_pending ON push_deliveries(delivered_at, next_attempt_at);
