-- Newsletter subscribers (single opt-in by default).
CREATE TABLE IF NOT EXISTS subscribers (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  status      TEXT NOT NULL DEFAULT 'subscribed',   -- subscribed | unsubscribed
  unsub_token TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsub_token ON subscribers (unsub_token);

-- Lightweight send log.
CREATE TABLE IF NOT EXISTS campaigns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject    TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
